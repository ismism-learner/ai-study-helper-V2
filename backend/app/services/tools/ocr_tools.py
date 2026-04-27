"""OCR相关工具定义 — 支持通过book_id自动查找文件路径"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.services.tools.base import ToolDefinition, ToolResult, ToolRegistry

logger = logging.getLogger(__name__)


# ── 辅助函数 ──────────────────────────────────────────────


def _resolve_book_file_path(book_id: str | None = None, book_title: str | None = None) -> str | None:
    """通过book_id或book_title从数据库查找PDF文件路径"""
    from app.database import SessionLocal
    from app.models import BookDocument

    with SessionLocal() as db:
        book = None
        if book_id:
            book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
        if not book and book_title:
            book = db.query(BookDocument).filter(BookDocument.title == book_title).first()

        if book and book.file_path:
            # 尝试多种路径解析
            file_path = book.file_path
            if os.path.exists(file_path):
                return file_path

            # 尝试在uploads/books目录下查找
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            possible_paths = [
                os.path.join("uploads", "books", file_path),
                os.path.join(backend_dir, "uploads", "books", file_path),
                os.path.join(backend_dir, file_path),
            ]
            for p in possible_paths:
                if os.path.exists(p):
                    return p

            # 尝试用original_filename查找
            if book.original_filename:
                for p in [
                    os.path.join("uploads", "books", book.original_filename),
                    os.path.join(backend_dir, "uploads", "books", book.original_filename),
                ]:
                    if os.path.exists(p):
                        return p

            # 返回原始路径（即使不存在，让后续逻辑报错）
            return file_path

    return None


def _get_ocr_text_file_path(pdf_path: str) -> str | None:
    """获取OCR文本缓存文件路径（*_ocr_text.txt）"""
    base, ext = os.path.splitext(pdf_path)
    text_file = f"{base}_ocr_text.txt"
    if os.path.exists(text_file):
        return text_file
    return None


def _read_ocr_text_cache(book_id: str | None = None, book_title: str | None = None) -> str | None:
    """读取已有的OCR文本缓存"""
    pdf_path = _resolve_book_file_path(book_id, book_title)
    if not pdf_path:
        return None
    text_file = _get_ocr_text_file_path(pdf_path)
    if not text_file:
        return None
    try:
        with open(text_file, encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


# ── 工具实现 ──────────────────────────────────────────────


async def ocr_process_page(params: dict[str, Any]) -> ToolResult:
    """对PDF指定页面执行OCR识别"""
    try:
        from app.services.paddleocr_service import paddleocr_service

        # 优先从book_id/book_title查找文件路径
        file_path = params.get("file_path")
        if not file_path:
            file_path = _resolve_book_file_path(
                book_id=params.get("book_id"),
                book_title=params.get("book_title"),
            )
        if not file_path or not os.path.exists(file_path):
            return ToolResult(
                success=False,
                error=f"找不到PDF文件。请提供book_id参数，或确认书籍已上传。",
            )

        page_number = params.get("page_number", 1)

        # 先检查是否有OCR文本缓存
        ocr_text = _read_ocr_text_cache(book_id=params.get("book_id"), book_title=params.get("book_title"))
        if ocr_text:
            # 从缓存中查找该页面的内容
            # OCR文本通常按章节或页面组织，尝试提取相关部分
            lines = ocr_text.split("\n")
            # 查找包含页码标记的行
            page_marker_lines = [
                i
                for i, line in enumerate(lines)
                if f"第{page_number}页" in line
                or f"page {page_number}" in line.lower()
                or f"=== 第{page_number}页" in line
            ]
            if page_marker_lines:
                start = page_marker_lines[0]
                end = start + 1
                # 找到下一个页码标记作为结束
                for i in range(start + 1, len(lines)):
                    if any(
                        f"第{j}页" in lines[i] or f"=== 第{j}页" in lines[i]
                        for j in range(page_number + 1, page_number + 5)
                    ):
                        end = i
                        break
                    if i - start > 200:  # 最多取200行
                        end = i
                        break
                page_text = "\n".join(lines[start:end])
                return ToolResult(
                    success=True,
                    result={
                        "page_number": page_number,
                        "text": page_text,
                        "char_count": len(page_text),
                        "source": "ocr_cache",
                    },
                )

            # 如果没有页码标记，直接用PaddleOCR处理
            result = await paddleocr_service.process_pdf(file_path, start_page=page_number - 1, end_page=page_number)
            if result and result.success:
                text = result.text_content or ""
                return ToolResult(
                    success=True,
                    result={"page_number": page_number, "text": text, "char_count": len(text), "source": "paddleocr"},
                )

        return ToolResult(
            success=False,
            error=f"OCR处理失败：第{page_number}页，且无缓存文本可用",
        )
    except Exception as e:
        logger.error(f"ocr_process_page error: {e}")
        return ToolResult(success=False, error=str(e))


async def ocr_get_text(params: dict[str, Any]) -> ToolResult:
    """获取OCR文本（优先从缓存，其次实时OCR）"""
    try:
        # 优先从book_id/book_title查找
        book_id = params.get("book_id")
        book_title = params.get("book_title")
        file_path = params.get("file_path")

        if not file_path:
            file_path = _resolve_book_file_path(book_id=book_id, book_title=book_title)
        if not file_path:
            return ToolResult(
                success=False,
                error=f"找不到PDF文件。请提供book_id参数。",
            )

        start_page = params.get("start_page", 1)
        end_page = params.get("end_page")

        # 优先读取OCR文本缓存
        ocr_text = _read_ocr_text_cache(book_id=book_id, book_title=book_title)
        if ocr_text:
            total_chars = len(ocr_text)
            # 如果指定了页面范围，尝试截取
            if start_page and end_page:
                # 简单返回全部文本（分页截取在搜索工具中处理）
                text = ocr_text[:8000]
            else:
                text = ocr_text[:8000]

            return ToolResult(
                success=True,
                result={
                    "total_chars": total_chars,
                    "text": text,
                    "source": "ocr_cache",
                    "has_full_text": True,
                },
            )

        # 没有缓存，尝试实时OCR
        if not os.path.exists(file_path):
            return ToolResult(
                success=False,
                error=f"PDF文件不存在: {file_path}",
            )

        from app.services.paddleocr_service import paddleocr_service

        result = await paddleocr_service.process_pdf(
            file_path,
            start_page=start_page - 1 if start_page > 0 else 0,
            end_page=end_page,
        )
        if not result or not result.success:
            return ToolResult(success=False, error="实时OCR处理失败")

        text = result.text_content or ""
        return ToolResult(
            success=True,
            result={
                "total_chars": len(text),
                "text": text[:8000],
                "source": "paddleocr_live",
                "has_full_text": False,
            },
        )
    except Exception as e:
        logger.error(f"ocr_get_text error: {e}")
        return ToolResult(success=False, error=str(e))


async def ocr_search_text(params: dict[str, Any]) -> ToolResult:
    """在OCR文本中搜索关键词，返回关键词上下文±500字"""
    try:
        book_id = params.get("book_id")
        book_title = params.get("book_title")
        keyword = params.get("keyword", "")
        context_chars = params.get("context_chars", 500)

        if not keyword:
            return ToolResult(success=False, error="搜索关键词不能为空")

        # 读取OCR文本缓存
        ocr_text = _read_ocr_text_cache(book_id=book_id, book_title=book_title)
        if not ocr_text:
            return ToolResult(
                success=False,
                error="没有OCR文本缓存。请先对这本书进行OCR处理。",
            )

        # 搜索关键词
        results: list[dict[str, Any]] = []
        search_pos = 0
        keyword_lower = keyword.lower()
        text_lower = ocr_text.lower()

        while search_pos < len(text_lower):
            pos = text_lower.find(keyword_lower, search_pos)
            if pos == -1:
                break

            # 提取上下文
            start = max(0, pos - context_chars)
            end = min(len(ocr_text), pos + len(keyword) + context_chars)

            # 尝试找到行边界（避免截断在行中间）
            if start > 0:
                newline_pos = ocr_text.rfind("\n", start, pos)
                if newline_pos != -1:
                    start = newline_pos + 1
            if end < len(ocr_text):
                newline_pos = ocr_text.find("\n", pos, end)
                if newline_pos != -1:
                    end = newline_pos

            context = ocr_text[start:end]
            results.append(
                {
                    "position": pos,
                    "context": context,
                    "context_start": start,
                    "context_end": end,
                }
            )

            search_pos = pos + len(keyword)

            # 最多返回5个匹配
            if len(results) >= 5:
                break

        if not results:
            return ToolResult(
                success=True,
                result={"keyword": keyword, "matches": 0, "results": [], "message": f"未找到关键词「{keyword}」"},
            )

        return ToolResult(
            success=True,
            result={
                "keyword": keyword,
                "matches": len(results),
                "total_text_length": len(ocr_text),
                "results": results,
            },
        )
    except Exception as e:
        logger.error(f"ocr_search_text error: {e}")
        return ToolResult(success=False, error=str(e))


async def ocr_get_status(params: dict[str, Any]) -> ToolResult:
    """检查OCR处理状态"""
    try:
        book_id = params.get("book_id")
        book_title = params.get("book_title")
        file_path = params.get("file_path")

        if not file_path:
            file_path = _resolve_book_file_path(book_id=book_id, book_title=book_title)
        if not file_path:
            return ToolResult(
                success=False,
                error="找不到书籍文件。请提供book_id参数。",
            )

        has_ocr_cache = _get_ocr_text_file_path(file_path) is not None
        file_exists = os.path.exists(file_path)
        file_size = os.path.getsize(file_path) if file_exists else 0

        # 如果有缓存，读取一些统计信息
        ocr_text = _read_ocr_text_cache(book_id=book_id, book_title=book_title)
        ocr_text_length = len(ocr_text) if ocr_text else 0

        return ToolResult(
            success=True,
            result={
                "file_exists": file_exists,
                "file_size": file_size,
                "has_ocr_cache": has_ocr_cache,
                "ocr_text_length": ocr_text_length,
            },
        )
    except Exception as e:
        logger.error(f"ocr_get_status error: {e}")
        return ToolResult(success=False, error=str(e))


# ── 工具定义（OpenAI function calling schema） ──────────


OCR_TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="ocr_process_page",
        description="对书籍PDF的指定页面获取文本内容。优先从已有OCR缓存读取，其次实时OCR。需要提供book_id（书籍ID）或book_title（书籍标题），不需要提供文件路径。",
        parameters={
            "type": "object",
            "properties": {
                "book_id": {"type": "string", "description": "书籍ID（优先使用）"},
                "book_title": {"type": "string", "description": "书籍标题（当没有book_id时使用）"},
                "page_number": {"type": "integer", "description": "页码（从1开始）", "default": 1},
            },
            "required": [],
        },
        handler=ocr_process_page,
    ),
    ToolDefinition(
        name="ocr_get_text",
        description="获取书籍的OCR文本内容。优先从已有OCR缓存读取。需要提供book_id或book_title，不需要提供文件路径。",
        parameters={
            "type": "object",
            "properties": {
                "book_id": {"type": "string", "description": "书籍ID（优先使用）"},
                "book_title": {"type": "string", "description": "书籍标题"},
                "start_page": {"type": "integer", "description": "起始页码（从1开始）", "default": 1},
                "end_page": {"type": "integer", "description": "结束页码"},
            },
            "required": [],
        },
        handler=ocr_get_text,
    ),
    ToolDefinition(
        name="ocr_search_text",
        description="在书籍的OCR文本中搜索关键词，返回关键词所在位置及其上下文（关键词前后各扩展500字）。适用于在长文本中定位特定内容。需要提供book_id或book_title以及搜索关键词。",
        parameters={
            "type": "object",
            "properties": {
                "book_id": {"type": "string", "description": "书籍ID（优先使用）"},
                "book_title": {"type": "string", "description": "书籍标题"},
                "keyword": {"type": "string", "description": "要搜索的关键词"},
                "context_chars": {
                    "type": "integer",
                    "description": "关键词前后扩展的字符数（默认500）",
                    "default": 500,
                },
            },
            "required": ["keyword"],
        },
        handler=ocr_search_text,
    ),
    ToolDefinition(
        name="ocr_get_status",
        description="检查书籍的OCR处理状态，包括是否有OCR文本缓存、文本长度等。需要提供book_id或book_title。",
        parameters={
            "type": "object",
            "properties": {
                "book_id": {"type": "string", "description": "书籍ID（优先使用）"},
                "book_title": {"type": "string", "description": "书籍标题"},
            },
            "required": [],
        },
        handler=ocr_get_status,
    ),
]


def register_ocr_tools(registry: ToolRegistry) -> None:
    for tool in OCR_TOOLS:
        registry.register(tool)
