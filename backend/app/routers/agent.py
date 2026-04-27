"""Agent API路由 — /agent/chat, /agent/chat/stream, /agent/tools"""

import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.agent_service import agent_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


# ── 请求/响应模型 ──────────────────────────────────────


class AgentChatRequest(BaseModel):
    messages: list[dict] = Field(..., description="对话历史")
    book_id: str | None = None
    book_title: str | None = None
    source_doc_id: str | None = None
    chapter_index: int | None = None
    ocr_text: str | None = None


class AgentChatResponse(BaseModel):
    message: str
    tool_calls: list[dict]
    total_rounds: int


# ── 端点 ────────────────────────────────────────────────


@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(request: AgentChatRequest):
    """Agent对话（非流式）"""
    try:
        response = await agent_service.chat(
            messages=request.messages,
            book_id=request.book_id,
            book_title=request.book_title,
            source_doc_id=request.source_doc_id,
            chapter_index=request.chapter_index,
            ocr_text=request.ocr_text,
        )
        return AgentChatResponse(**response.to_dict())
    except Exception as e:
        logger.error(f"agent_chat error: {e}")
        raise


@router.post("/chat/stream")
async def agent_chat_stream(request: AgentChatRequest):
    """Agent对话（流式SSE）"""

    async def event_generator():
        try:
            async for chunk in agent_service.chat_stream(
                messages=request.messages,
                book_id=request.book_id,
                book_title=request.book_title,
                source_doc_id=request.source_doc_id,
                chapter_index=request.chapter_index,
                ocr_text=request.ocr_text,
            ):
                yield chunk
        except Exception as e:
            logger.error(f"agent_chat_stream error: {e}")
            error_data = json.dumps({"type": "error", "error": str(e)}, ensure_ascii=False)
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
async def list_tools():
    """列出所有可用Agent工具"""
    tools = agent_service.get_tool_definitions()
    return {
        "total": len(tools),
        "tools": tools,
    }
