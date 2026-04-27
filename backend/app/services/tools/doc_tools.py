"""文档处理工具定义"""

from __future__ import annotations

import logging
from typing import Any

from app.services.tools.base import ToolDefinition, ToolResult, ToolRegistry

logger = logging.getLogger(__name__)


# ── 工具实现 ──────────────────────────────────────────────


async def doc_generate_framework(params: dict[str, Any]) -> ToolResult:
    """生成文档正文（从原文内容生成经过AI处理的文章正文）"""
    try:
        from app.config import settings_manager
        from app.database import SessionLocal
        from app.models import Document

        doc_id = params["doc_id"]

        with SessionLocal() as db:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                return ToolResult(success=False, error="文档不存在")
            if not doc.original_content:
                return ToolResult(success=False, error="文档没有原文内容")

            from app.services.ai_service import ai_service

            prompt_template = settings_manager.framework_prompt
            content_to_process = doc.original_content[:15000]
            prompt = prompt_template.replace("{content}", content_to_process)

            generated_content = await ai_service.generate_text(
                prompt,
                system_prompt="你是一个专业的中文编辑，擅长将口语化内容转化为高质量的书面文章。",
            )

            doc.framework_content = generated_content
            db.commit()

            return ToolResult(
                success=True,
                result={
                    "doc_id": doc_id,
                    "title": doc.title,
                    "content_length": len(generated_content),
                    "preview": generated_content[:500],
                },
            )
    except Exception as e:
        logger.error(f"doc_generate_framework error: {e}")
        return ToolResult(success=False, error=str(e))


async def doc_optimize_paragraph(params: dict[str, Any]) -> ToolResult:
    """优化段落，将口语化表达转换为书面化表达"""
    try:
        from app.services.ai_service import ai_service

        paragraph = params["paragraph"]
        if not paragraph or not paragraph.strip():
            return ToolResult(success=False, error="段落内容不能为空")

        optimized = await ai_service.optimize_paragraph(paragraph)
        return ToolResult(
            success=True,
            result={"original_length": len(paragraph), "optimized": optimized, "optimized_length": len(optimized)},
        )
    except Exception as e:
        logger.error(f"doc_optimize_paragraph error: {e}")
        return ToolResult(success=False, error=str(e))


async def doc_polish_note(params: dict[str, Any]) -> ToolResult:
    """润色笔记内容"""
    try:
        from app.services.ai_service import ai_service

        note_content = params["note_content"]
        if not note_content or not note_content.strip():
            return ToolResult(success=False, error="笔记内容不能为空")

        polished = await ai_service.polish_note(note_content)
        return ToolResult(
            success=True,
            result={"polished": polished},
        )
    except Exception as e:
        logger.error(f"doc_polish_note error: {e}")
        return ToolResult(success=False, error=str(e))


async def doc_generate_chapter_note(params: dict[str, Any]) -> ToolResult:
    """从OCR文本生成章节笔记"""
    try:
        from app.config import settings_manager
        from app.services.ai_service import ai_service

        original_text = params["original_text"]
        chapter_title = params.get("chapter_title", "未命名章节")

        if not original_text or not original_text.strip():
            return ToolResult(success=False, error="原始文本不能为空")

        system_prompt = settings_manager.chapter_note_system_prompt
        user_prompt = settings_manager.chapter_note_prompt.replace("{chapter_title}", chapter_title).replace(
            "{original_text}", original_text[:12000]
        )

        markdown_content = await ai_service.generate_text(
            user_prompt,
            system_prompt=system_prompt,
        )

        return ToolResult(
            success=True,
            result={
                "chapter_title": chapter_title,
                "markdown_content": markdown_content,
                "content_length": len(markdown_content),
            },
        )
    except Exception as e:
        logger.error(f"doc_generate_chapter_note error: {e}")
        return ToolResult(success=False, error=str(e))


# ── 工具定义（OpenAI function calling schema） ──────────


DOC_TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="doc_generate_framework",
        description="为指定文档生成结构化正文。从原文内容出发，经过AI处理生成高质量的文章正文。需要提供文档ID。",
        parameters={
            "type": "object",
            "properties": {
                "doc_id": {"type": "string", "description": "文档ID"},
            },
            "required": ["doc_id"],
        },
        handler=doc_generate_framework,
    ),
    ToolDefinition(
        name="doc_optimize_paragraph",
        description="优化段落内容，将口语化表达转换为书面化表达，删除重复性内容。",
        parameters={
            "type": "object",
            "properties": {
                "paragraph": {"type": "string", "description": "要优化的段落内容"},
            },
            "required": ["paragraph"],
        },
        handler=doc_optimize_paragraph,
    ),
    ToolDefinition(
        name="doc_polish_note",
        description="润色笔记内容，将口语化表达转换为规范的书面化表达，优化句子结构。",
        parameters={
            "type": "object",
            "properties": {
                "note_content": {"type": "string", "description": "要润色的笔记内容"},
            },
            "required": ["note_content"],
        },
        handler=doc_polish_note,
    ),
    ToolDefinition(
        name="doc_generate_chapter_note",
        description="从OCR识别的原始文本生成结构清晰的Markdown格式章节笔记。会修复OCR错误、整理代码块和公式。",
        parameters={
            "type": "object",
            "properties": {
                "original_text": {"type": "string", "description": "OCR识别的原始文本"},
                "chapter_title": {"type": "string", "description": "章节标题", "default": "未命名章节"},
            },
            "required": ["original_text"],
        },
        handler=doc_generate_chapter_note,
    ),
]


def register_doc_tools(registry: ToolRegistry) -> None:
    for tool in DOC_TOOLS:
        registry.register(tool)
