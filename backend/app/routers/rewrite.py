"""
长文本改写API路由
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import io

from app.services.long_text_rewrite_service import (
    rewrite_long_text,
    rewrite_long_text_stream,
    extract_sections,
    generate_framework,
)

router = APIRouter(prefix="/rewrite", tags=["rewrite"])


class RewriteRequest(BaseModel):
    """改写请求"""

    text: str
    system_prompt: Optional[str] = None
    user_prompt: Optional[str] = None
    style: Optional[str] = "通俗化"  # 通俗化、学术化、精简


class RewriteResponse(BaseModel):
    """改写响应"""

    rewritten_text: str
    sections_count: int


class SectionsRequest(BaseModel):
    """提取章节请求"""

    text: str


class SectionsResponse(BaseModel):
    """提取章节响应"""

    sections: list
    framework: str


@router.post("/extract-sections", response_model=SectionsResponse)
async def api_extract_sections(request: SectionsRequest):
    """
    提取文本的章节结构

    返回章节列表和缩略框架
    """
    try:
        sections = extract_sections(request.text)
        framework = generate_framework(sections)

        sections_list = [
            {
                "level": s.level,
                "number": s.number,
                "title": s.title,
                "identifier": s.identifier,
                "content_length": len(s.content),
            }
            for s in sections
        ]

        return SectionsResponse(sections=sections_list, framework=framework)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite", response_model=RewriteResponse)
async def api_rewrite_text(request: RewriteRequest):
    """
    改写长文本

    自动分段处理，保持原有信息量
    """
    try:
        # 提取章节以获取数量
        sections = extract_sections(request.text)

        # 执行改写
        rewritten = await rewrite_long_text(
            text=request.text,
            system_prompt=request.system_prompt,
            user_prompt=request.user_prompt,
        )

        return RewriteResponse(
            rewritten_text=rewritten, sections_count=len(sections) if sections else 1
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite-stream")
async def api_rewrite_text_stream(request: RewriteRequest):
    """
    流式改写长文本

    实时返回改写进度和内容
    """

    async def generate():
        try:
            async for chunk in rewrite_long_text_stream(
                text=request.text,
                system_prompt=request.system_prompt,
                user_prompt=request.user_prompt,
            ):
                yield chunk
        except Exception as e:
            yield f"[错误] {str(e)}\n"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


@router.post("/preview")
async def api_preview_rewrite(request: RewriteRequest):
    """
    预览改写效果

    只改写第一个章节，用于测试效果
    """
    try:
        sections = extract_sections(request.text)

        if not sections:
            # 没有识别到章节，改写前1000字作为预览
            preview_text = request.text[:1000]
            from app.services.long_text_rewrite_service import rewrite_section, Section

            section = Section(
                level=1,
                number="预览",
                title="预览",
                content=preview_text,
                identifier="***=== 预览 ===***",
            )
            rewritten = await rewrite_section(section)
        else:
            # 只改写第一个章节
            from app.services.long_text_rewrite_service import rewrite_section

            rewritten = await rewrite_section(sections[0])

        return {
            "preview": rewritten,
            "total_sections": len(sections) if sections else 1,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
