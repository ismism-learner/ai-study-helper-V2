"""Agent工具基础定义 — ToolDefinition, ToolRegistry, ToolResult"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    """工具执行结果"""

    success: bool
    result: Any = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"success": self.success}
        if self.result is not None:
            d["result"] = self.result
        if self.error is not None:
            d["error"] = self.error
        return d


@dataclass
class ToolDefinition:
    """单个工具定义（OpenAI function calling 格式）"""

    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema
    handler: Callable[..., Coroutine[Any, Any, ToolResult]]

    def to_openai_tool(self) -> dict[str, Any]:
        """转换为 OpenAI tools 参数格式"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    """工具注册表"""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        if tool.name in self._tools:
            logger.warning(f"工具 '{tool.name}' 已存在，将被覆盖")
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def list_tools(self) -> list[ToolDefinition]:
        return list(self._tools.values())

    def to_openai_tools(self) -> list[dict[str, Any]]:
        """转换为 OpenAI API 的 tools 参数"""
        return [t.to_openai_tool() for t in self._tools.values()]

    def tool_names(self) -> list[str]:
        return list(self._tools.keys())
