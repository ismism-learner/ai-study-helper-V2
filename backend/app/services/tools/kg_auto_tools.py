"""知识图谱自动生成工具定义"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.services.tools.base import ToolDefinition, ToolResult, ToolRegistry

logger = logging.getLogger(__name__)


# ── 工具实现 ──────────────────────────────────────────────


async def kg_auto_generate_from_text(params: dict[str, Any]) -> ToolResult:
    """从文本自动提取概念并生成知识图谱节点和边"""
    try:
        from app.config import settings_manager
        from app.database import SessionLocal
        from app.services.ai_service import ai_service
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        text = params["text"]
        book_id = params.get("book_id")
        book_title = params.get("book_title", "")
        chapter_index = params.get("chapter_index")

        # 截断过长文本
        text_to_process = text[:6000]

        # 使用AI提取概念 — 使用settings_manager中的kg_concept_prompt
        prompt = settings_manager.kg_concept_prompt
        if not prompt:
            prompt = f"""请从以下文本中提取所有重要的概念、实体和它们之间的关系。

文本内容：
{text_to_process}

请严格按照以下JSON格式输出，不要添加任何其他内容：
{{
  "concepts": [
    {{
      "name": "概念名称",
      "description": "概念描述（50-100字）",
      "entity_type": "Concept",
      "domain": "所属领域"
    }}
  ],
  "relations": [
    {{
      "source": "源概念名称",
      "target": "目标概念名称",
      "relation_type": "关系类型",
      "description": "关系描述"
    }}
  ]
}}

要求：
1. 提取所有重要的专业术语、核心概念、关键实体
2. 概念描述要通俗易懂
3. 关系类型包括但不限于：RELATES_TO（相关）、EXPLAINS（解释）、DEPENDS_ON（依赖）、PART_OF（部分）
4. 只输出JSON，不要有其他文字"""

        # 如果prompt包含占位符则替换
        prompt = prompt.replace("{text}", text_to_process).replace("{content}", text_to_process)

        raw_output = await ai_service.generate_text(
            prompt,
            system_prompt="你是一个知识图谱构建助手，擅长从文本中提取概念和关系。只输出JSON格式。",
        )

        # 解析AI输出
        concepts: list[dict] = []
        relations: list[dict] = []

        try:
            # 尝试从markdown代码块中提取JSON
            json_str = raw_output
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]

            parsed = json.loads(json_str.strip())
            concepts = parsed.get("concepts", [])
            relations = parsed.get("relations", [])
        except (json.JSONDecodeError, IndexError) as e:
            logger.warning(f"解析AI输出失败: {e}, raw: {raw_output[:200]}")
            return ToolResult(
                success=False,
                error=f"AI输出解析失败: {str(e)}",
            )

        # 创建节点
        created_nodes: list[dict] = []
        node_name_to_id: dict[str, str] = {}

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)

            for concept in concepts:
                try:
                    node = service.create_node(
                        name=concept.get("name", ""),
                        description=concept.get("description", ""),
                        entity_type=concept.get("entity_type", "Concept"),
                        domain=concept.get("domain"),
                        book_id=book_id,
                        book_title=book_title,
                        chapter_index=chapter_index,
                        node_type="DetailedQuestion",
                    )
                    created_nodes.append({"id": node.id, "name": node.name})
                    node_name_to_id[node.name] = node.id
                except Exception as e:
                    logger.warning(f"创建节点失败: {concept.get('name')}, error: {e}")

            # 创建边
            created_edges: list[dict] = []
            for relation in relations:
                source_name = relation.get("source", "")
                target_name = relation.get("target", "")
                source_id = node_name_to_id.get(source_name)
                target_id = node_name_to_id.get(target_name)

                if source_id and target_id:
                    try:
                        edge = service.create_edge(
                            source_id=source_id,
                            target_id=target_id,
                            relation_type=relation.get("relation_type", "RELATES_TO"),
                            edge_type="BRANCH_EXTEND",
                            description=relation.get("description"),
                            book_id=book_id,
                        )
                        if edge:
                            created_edges.append({"id": edge.id, "source": source_name, "target": target_name})
                    except Exception as e:
                        logger.warning(f"创建边失败: {source_name} -> {target_name}, error: {e}")

        return ToolResult(
            success=True,
            result={
                "nodes_created": len(created_nodes),
                "edges_created": len(created_edges),
                "nodes": created_nodes,
                "edges": created_edges,
            },
        )
    except Exception as e:
        logger.error(f"kg_auto_generate_from_text error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_quick_summary(params: dict[str, Any]) -> ToolResult:
    """创建快速摘要节点（QuickSummary），用于概括一段文本的核心内容"""
    try:
        from app.config import settings_manager
        from app.database import SessionLocal
        from app.services.ai_service import ai_service
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        text = params["text"]
        book_id = params.get("book_id")
        book_title = params.get("book_title", "")
        chapter_index = params.get("chapter_index")
        text_position = params.get("text_position")

        # 使用AI生成摘要
        prompt = settings_manager.quick_summary_prompt if hasattr(settings_manager, "quick_summary_prompt") else ""
        if not prompt:
            prompt = """请快速梳理以下文本的核心内容和逻辑结构。
输出格式要求（必须严格遵循，只输出JSON，不要有其他内容）：
```json
{
  "label": "章节/段落标题（简短概括，2-10个字）",
  "definition": "核心内容概述（50-100字，通俗易懂）",
  "key_concepts": ["核心概念1", "核心概念2", "核心概念3"],
  "suggested_questions": ["追问建议1", "追问建议2"]
}
```"""

        context_section = f"\n参考内容：\n{text[:2000]}" if text else ""
        full_prompt = (
            prompt.replace("{concept}", text[:1000])
            if "{concept}" in prompt
            else prompt + f"\n\n概念：{text[:1000]}{context_section}"
        )

        raw_output = await ai_service.generate_text(
            full_prompt,
            system_prompt="你是一个知识渊博的导师，请用通俗易懂的方式详细解释概念。只输出JSON格式。",
        )

        # 解析AI输出
        label = text[:20]
        definition = ""
        key_concepts: list[str] = []

        try:
            json_str = raw_output
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]

            parsed = json.loads(json_str.strip())
            label = parsed.get("label", label)
            definition = parsed.get("definition", "")
            key_concepts = parsed.get("key_concepts", [])
        except (json.JSONDecodeError, IndexError):
            definition = raw_output[:200]

        # 创建QuickSummary节点
        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            node = service.create_node(
                name=label,
                description=definition,
                entity_type="Summary",
                book_id=book_id,
                book_title=book_title,
                chapter_index=chapter_index,
                node_type="QuickSummary",
                text_position=text_position,
            )

        return ToolResult(
            success=True,
            result={
                "id": node.id,
                "name": node.name,
                "description": node.description,
                "key_concepts": key_concepts,
            },
        )
    except Exception as e:
        logger.error(f"kg_quick_summary error: {e}")
        return ToolResult(success=False, error=str(e))


# ── 工具定义（OpenAI function calling schema） ──────────


KG_AUTO_TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="kg_auto_generate_from_text",
        description="从文本中自动提取概念和关系，并生成知识图谱的节点和边。适用于对一段文本进行知识图谱自动构建。",
        parameters={
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "要分析的文本内容"},
                "book_id": {"type": "string", "description": "关联书籍ID"},
                "book_title": {"type": "string", "description": "关联书籍标题"},
                "chapter_index": {"type": "integer", "description": "章节索引"},
            },
            "required": ["text"],
        },
        handler=kg_auto_generate_from_text,
    ),
    ToolDefinition(
        name="kg_quick_summary",
        description="对一段文本生成快速摘要节点（QuickSummary），概括核心内容并提取关键概念。适用于知识图谱的快速梳理。",
        parameters={
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "要摘要的文本内容"},
                "book_id": {"type": "string", "description": "关联书籍ID"},
                "book_title": {"type": "string", "description": "关联书籍标题"},
                "chapter_index": {"type": "integer", "description": "章节索引"},
                "text_position": {"type": "integer", "description": "文本在原文中的位置"},
            },
            "required": ["text"],
        },
        handler=kg_quick_summary,
    ),
]


def register_kg_auto_tools(registry: ToolRegistry) -> None:
    for tool in KG_AUTO_TOOLS:
        registry.register(tool)
