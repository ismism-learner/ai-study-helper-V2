"""Agent工具注册入口 — 统一注册所有工具"""

from app.services.tools.base import ToolRegistry
from app.services.tools.ocr_tools import register_ocr_tools
from app.services.tools.kg_tools import register_kg_tools
from app.services.tools.kg_auto_tools import register_kg_auto_tools
from app.services.tools.doc_tools import register_doc_tools


def register_all_tools(registry: ToolRegistry) -> None:
    """注册所有Agent工具到注册表"""
    register_ocr_tools(registry)
    register_kg_tools(registry)
    register_kg_auto_tools(registry)
    register_doc_tools(registry)
