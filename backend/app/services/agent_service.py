"""Agent服务 — 支持Function Calling的AI对话循环"""

from __future__ import annotations

import json
import logging
import traceback
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

from app.services.tools import register_all_tools
from app.services.tools.base import ToolRegistry, ToolResult

logger = logging.getLogger(__name__)


@dataclass
class ToolCallRecord:
    """单次工具调用记录"""

    tool_call_id: str
    tool_name: str
    arguments: dict
    result: ToolResult | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "tool_call_id": self.tool_call_id,
            "tool_name": self.tool_name,
            "arguments": self.arguments,
        }
        if self.result is not None:
            d["result"] = self.result.to_dict()
        return d


@dataclass
class AgentResponse:
    """Agent对话响应"""

    message: str
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    total_rounds: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "tool_calls": [tc.to_dict() for tc in self.tool_calls],
            "total_rounds": self.total_rounds,
        }


# ── 系统提示词 ──────────────────────────────────────────

AGENT_SYSTEM_PROMPT = """你是一个智能学习助手Agent，可以帮助用户处理PDF文档、管理知识图谱和优化文档内容。

【你的能力】
1. **OCR处理**：对PDF文件进行OCR识别，提取文本内容，搜索文本中的关键词
2. **知识图谱管理**：创建/删除/搜索/更新知识图谱的节点和关系
3. **知识图谱自动生成**：从文本中自动提取概念和关系，构建知识图谱
4. **文档处理**：生成文档正文、优化段落、润色笔记、生成章节笔记

【重要规则 — 必须严格遵守】
1. **不要向用户询问文件路径或book_id**：系统已自动将当前书籍的book_id和book_title注入到你的上下文中，所有OCR工具和知识图谱工具都支持通过book_id自动查找文件。直接调用工具即可。
2. **主动调用工具**：当用户请求涉及上述能力时，直接调用相应工具，不要告诉用户"你需要先做X"或"请提供Y路径"。你是Agent，你的职责就是自动完成操作。
3. **连续调用**：可以连续调用多个工具完成复杂任务（如：先OCR提取文本，再自动生成知识图谱），不需要每一步都等待用户确认。
4. **危险操作确认**：仅对删除节点、清除知识图谱等不可逆操作，才需要向用户确认。
5. **工具调用失败时**：如果工具返回错误，分析错误原因并尝试替代方案，而不是直接把错误抛给用户。

【上下文信息】
{context}

请用中文回复用户。"""


class AgentService:
    """Agent服务 — 管理对话循环、工具注册和执行"""

    def __init__(self) -> None:
        self.tool_registry = ToolRegistry()
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        register_all_tools(self.tool_registry)

    def get_tool_definitions(self) -> list[dict[str, Any]]:
        """获取所有工具定义（OpenAI格式）"""
        return self.tool_registry.to_openai_tools()

    def _build_system_prompt(
        self,
        book_id: str | None = None,
        book_title: str | None = None,
        source_doc_id: str | None = None,
        chapter_index: int | None = None,
        ocr_text: str | None = None,
    ) -> str:
        """构建Agent系统提示词，包含上下文信息"""
        context_parts: list[str] = []

        if book_title:
            context_parts.append(f"当前书籍：{book_title}")
        if book_id:
            context_parts.append(f"书籍ID：{book_id}")
            context_parts.append("⚠️ 你已拥有book_id，调用OCR和知识图谱工具时直接使用此book_id，无需询问用户。")
        if source_doc_id:
            context_parts.append(f"文档ID：{source_doc_id}")
        if chapter_index is not None:
            context_parts.append(f"当前章节索引：{chapter_index}")
        if ocr_text:
            preview = ocr_text[:500] + ("..." if len(ocr_text) > 500 else "")
            context_parts.append(f"当前OCR文本预览：\n{preview}")

        context = "\n".join(context_parts) if context_parts else "暂无额外上下文"
        return AGENT_SYSTEM_PROMPT.format(context=context)

    async def _execute_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> ToolResult:
        """执行单个工具调用"""
        tool_def = self.tool_registry.get(tool_name)
        if not tool_def:
            return ToolResult(success=False, error=f"未知工具: {tool_name}")

        try:
            # 将上下文信息注入参数（如果工具需要但用户未提供）
            if context:
                for key in ("book_id", "book_title", "chapter_index"):
                    if key not in arguments and key in context and context[key] is not None:
                        arguments[key] = context[key]

            result = await tool_def.handler(arguments)
            return result
        except Exception as e:
            logger.error(f"工具执行异常: {tool_name}, error: {e}")
            traceback.print_exc()
            return ToolResult(success=False, error=str(e))

    async def chat(
        self,
        messages: list[dict[str, Any]],
        book_id: str | None = None,
        book_title: str | None = None,
        source_doc_id: str | None = None,
        chapter_index: int | None = None,
        ocr_text: str | None = None,
        max_tool_rounds: int = 10,
    ) -> AgentResponse:
        """
        执行Agent对话循环（非流式）

        1. 构建系统提示词
        2. 发送messages + tools给LLM
        3. 如果LLM返回tool_calls → 执行工具 → 结果加入messages → 重新调用
        4. 循环直到LLM返回纯文本或达到max_tool_rounds
        """
        from app.services.ai_service import ai_service

        context = {
            "book_id": book_id,
            "book_title": book_title,
            "source_doc_id": source_doc_id,
            "chapter_index": chapter_index,
            "ocr_text": ocr_text,
        }

        system_prompt = self._build_system_prompt(
            book_id=book_id,
            book_title=book_title,
            source_doc_id=source_doc_id,
            chapter_index=chapter_index,
            ocr_text=ocr_text,
        )

        # 构建完整消息列表
        full_messages = [{"role": "system", "content": system_prompt}]
        # 跳过用户消息中已有的system消息
        for msg in messages:
            if msg.get("role") == "system":
                continue
            full_messages.append(msg)

        tools = self.get_tool_definitions()
        tool_call_records: list[ToolCallRecord] = []
        rounds = 0

        while rounds < max_tool_rounds:
            rounds += 1

            try:
                response = await ai_service.generate_with_tools(
                    messages=full_messages,
                    tools=tools,
                )
            except Exception as e:
                logger.error(f"Agent LLM调用失败: {e}")
                return AgentResponse(
                    message=f"AI调用失败: {str(e)}",
                    tool_calls=tool_call_records,
                    total_rounds=rounds,
                )

            content = response.get("content")
            tool_calls = response.get("tool_calls")
            finish_reason = response.get("finish_reason", "")

            # 如果没有工具调用，返回文本回复
            if not tool_calls or finish_reason == "stop":
                return AgentResponse(
                    message=content or "",
                    tool_calls=tool_call_records,
                    total_rounds=rounds,
                )

            # 处理工具调用
            # 添加assistant消息（含tool_calls）到消息列表
            assistant_msg: dict[str, Any] = {"role": "assistant"}
            if content:
                assistant_msg["content"] = content
            else:
                assistant_msg["content"] = None

            # 转换tool_calls为OpenAI消息格式
            openai_tool_calls = []
            for tc in tool_calls:
                openai_tool_calls.append(
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["function"]["name"],
                            "arguments": tc["function"]["arguments"],
                        },
                    }
                )

            assistant_msg["tool_calls"] = openai_tool_calls
            full_messages.append(assistant_msg)

            # 执行每个工具调用
            for tc in tool_calls:
                tool_call_id = tc["id"]
                tool_name = tc["function"]["name"]
                arguments_str = tc["function"]["arguments"]

                # 解析参数
                try:
                    arguments = json.loads(arguments_str) if isinstance(arguments_str, str) else arguments_str
                except json.JSONDecodeError:
                    arguments = {}

                record = ToolCallRecord(
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    arguments=arguments,
                )

                # 执行工具
                result = await self._execute_tool(tool_name, arguments, context)
                record.result = result
                tool_call_records.append(record)

                # 将工具结果加入消息列表
                result_content = json.dumps(result.to_dict(), ensure_ascii=False)
                full_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": result_content,
                    }
                )

        # 达到最大轮次
        return AgentResponse(
            message="已达到最大工具调用轮次，请继续对话以获取更多结果。",
            tool_calls=tool_call_records,
            total_rounds=rounds,
        )

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        book_id: str | None = None,
        book_title: str | None = None,
        source_doc_id: str | None = None,
        chapter_index: int | None = None,
        ocr_text: str | None = None,
        max_tool_rounds: int = 10,
    ) -> AsyncGenerator[str, None]:
        """
        流式Agent对话 — 使用SSE格式

        每个事件格式:
        - 文本chunk: {"type": "text", "content": "..."}
        - 工具调用开始: {"type": "tool_call_start", "tool_name": "...", "tool_id": "...", "arguments": {...}}
        - 工具调用结果: {"type": "tool_call_result", "tool_id": "...", "result": {...}}
        - 完成: {"type": "done", "message": "..."}
        - 错误: {"type": "error", "error": "..."}
        """
        from app.services.ai_service import ai_service

        context = {
            "book_id": book_id,
            "book_title": book_title,
            "source_doc_id": source_doc_id,
            "chapter_index": chapter_index,
            "ocr_text": ocr_text,
        }

        system_prompt = self._build_system_prompt(
            book_id=book_id,
            book_title=book_title,
            source_doc_id=source_doc_id,
            chapter_index=chapter_index,
            ocr_text=ocr_text,
        )

        full_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages:
            if msg.get("role") == "system":
                continue
            full_messages.append(msg)

        tools = self.get_tool_definitions()
        tool_call_records: list[ToolCallRecord] = []
        rounds = 0

        while rounds < max_tool_rounds:
            rounds += 1
            accumulated_text = ""
            accumulated_tool_calls: list[dict[str, Any]] = []

            try:
                async for event in ai_service.generate_with_tools_stream(
                    messages=full_messages,
                    tools=tools,
                ):
                    event_type = event.get("type")

                    if event_type == "text":
                        accumulated_text += event["content"]
                        yield f"data: {json.dumps({'type': 'text', 'content': event['content']}, ensure_ascii=False)}\n\n"

                    elif event_type == "tool_call":
                        tc = event["tool_call"]
                        accumulated_tool_calls.append(tc)
                        # 解析参数
                        try:
                            args = (
                                json.loads(tc["function"]["arguments"])
                                if isinstance(tc["function"]["arguments"], str)
                                else tc["function"]["arguments"]
                            )
                        except json.JSONDecodeError:
                            args = {}

                        yield f"data: {json.dumps({'type': 'tool_call_start', 'tool_name': tc['function']['name'], 'tool_id': tc['id'], 'arguments': args}, ensure_ascii=False)}\n\n"

                    elif event_type == "done":
                        pass  # 处理在循环结束后

            except Exception as e:
                logger.error(f"Agent stream LLM调用失败: {e}")
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"
                return

            # 如果没有工具调用，流式输出完成
            if not accumulated_tool_calls:
                yield f"data: {json.dumps({'type': 'done', 'message': accumulated_text}, ensure_ascii=False)}\n\n"
                return

            # 处理工具调用
            assistant_msg: dict[str, Any] = {"role": "assistant"}
            assistant_msg["content"] = accumulated_text if accumulated_text else None
            assistant_msg["tool_calls"] = accumulated_tool_calls
            full_messages.append(assistant_msg)

            # 执行每个工具
            for tc in accumulated_tool_calls:
                tool_call_id = tc["id"]
                tool_name = tc["function"]["name"]
                arguments_str = tc["function"]["arguments"]

                try:
                    arguments = json.loads(arguments_str) if isinstance(arguments_str, str) else arguments_str
                except json.JSONDecodeError:
                    arguments = {}

                record = ToolCallRecord(
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    arguments=arguments,
                )

                # 执行工具
                result = await self._execute_tool(tool_name, arguments, context)
                record.result = result
                tool_call_records.append(record)

                # 发送工具结果事件
                yield f"data: {json.dumps({'type': 'tool_call_result', 'tool_id': tool_call_id, 'tool_name': tool_name, 'result': result.to_dict()}, ensure_ascii=False)}\n\n"

                # 将结果加入消息列表
                result_content = json.dumps(result.to_dict(), ensure_ascii=False)
                full_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": result_content,
                    }
                )

        # 达到最大轮次
        yield f"data: {json.dumps({'type': 'done', 'message': '已达到最大工具调用轮次。'}, ensure_ascii=False)}\n\n"


# ── 单例 ─────────────────────────────────────────────────

agent_service = AgentService()
