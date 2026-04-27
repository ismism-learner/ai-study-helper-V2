"""知识图谱CRUD工具定义"""

from __future__ import annotations

import logging
from typing import Any

from app.services.tools.base import ToolDefinition, ToolResult, ToolRegistry

logger = logging.getLogger(__name__)


# ── 工具实现 ──────────────────────────────────────────────


async def kg_create_node(params: dict[str, Any]) -> ToolResult:
    """创建知识图谱节点"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            node = service.create_node(
                name=params["name"],
                description=params.get("description", ""),
                entity_type=params.get("entity_type", "Concept"),
                domain=params.get("domain"),
                book_id=params.get("book_id"),
                book_title=params.get("book_title"),
                chapter_index=params.get("chapter_index"),
                node_type=params.get("node_type", "DetailedQuestion"),
            )
            return ToolResult(
                success=True,
                result={
                    "id": node.id,
                    "name": node.name,
                    "description": node.description,
                    "entity_type": node.entity_type,
                    "domain": node.domain,
                    "node_type": node.node_type,
                },
            )
    except Exception as e:
        logger.error(f"kg_create_node error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_delete_node(params: dict[str, Any]) -> ToolResult:
    """删除知识图谱节点及其关联边"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            success = service.delete_node(params["node_id"])
            if not success:
                return ToolResult(success=False, error="节点不存在")
            return ToolResult(success=True, result={"deleted_node_id": params["node_id"]})
    except Exception as e:
        logger.error(f"kg_delete_node error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_update_node(params: dict[str, Any]) -> ToolResult:
    """更新知识图谱节点的名称或描述"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            node = service.update_node(
                node_id=params["node_id"],
                name=params.get("name"),
                description=params.get("description"),
            )
            if not node:
                return ToolResult(success=False, error="节点不存在")
            return ToolResult(
                success=True,
                result={
                    "id": node.id,
                    "name": node.name,
                    "description": node.description,
                },
            )
    except Exception as e:
        logger.error(f"kg_update_node error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_search_nodes(params: dict[str, Any]) -> ToolResult:
    """按关键词搜索知识图谱节点"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            nodes = service.search_nodes(
                keyword=params["keyword"],
                entity_type=params.get("entity_type"),
                limit=params.get("limit", 20),
            )
            return ToolResult(
                success=True,
                result=[
                    {
                        "id": n.id,
                        "name": n.name,
                        "description": n.description,
                        "entity_type": n.entity_type,
                        "domain": n.domain,
                        "book_title": n.book_title,
                        "node_type": n.node_type,
                    }
                    for n in nodes
                ],
            )
    except Exception as e:
        logger.error(f"kg_search_nodes error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_create_edge(params: dict[str, Any]) -> ToolResult:
    """创建知识图谱边（关系）"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            edge = service.create_edge(
                source_id=params["source_id"],
                target_id=params["target_id"],
                relation_type=params.get("relation_type", "RELATES_TO"),
                edge_type=params.get("edge_type", "BRANCH_EXTEND"),
                description=params.get("description"),
                book_id=params.get("book_id"),
            )
            if not edge:
                return ToolResult(success=False, error="创建边失败：源节点或目标节点不存在")
            return ToolResult(
                success=True,
                result={
                    "id": edge.id,
                    "source_id": edge.source_id,
                    "target_id": edge.target_id,
                    "relation_type": edge.relation_type,
                    "edge_type": edge.edge_type,
                },
            )
    except Exception as e:
        logger.error(f"kg_create_edge error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_delete_edge(params: dict[str, Any]) -> ToolResult:
    """删除知识图谱边（关系）"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            success = service.delete_edge(params["edge_id"])
            if not success:
                return ToolResult(success=False, error="关系不存在")
            return ToolResult(success=True, result={"deleted_edge_id": params["edge_id"]})
    except Exception as e:
        logger.error(f"kg_delete_edge error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_get_graph_data(params: dict[str, Any]) -> ToolResult:
    """获取知识图谱数据（节点和边）"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            data = service.get_graph_data(book_title=params.get("book_title"))
            return ToolResult(
                success=True,
                result={
                    "node_count": len(data["nodes"]),
                    "edge_count": len(data["edges"]),
                    "nodes": data["nodes"][:50],  # 限制返回数量
                    "edges": data["edges"][:50],
                },
            )
    except Exception as e:
        logger.error(f"kg_get_graph_data error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_get_statistics(params: dict[str, Any]) -> ToolResult:
    """获取知识图谱统计信息"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            stats = service.get_statistics()
            return ToolResult(success=True, result=stats)
    except Exception as e:
        logger.error(f"kg_get_statistics error: {e}")
        return ToolResult(success=False, error=str(e))


async def kg_clear_by_book(params: dict[str, Any]) -> ToolResult:
    """清除指定书籍的所有知识图谱数据（节点和边）"""
    try:
        from app.database import SessionLocal
        from app.services.sqlite.knowledge_graph_service import KnowledgeGraphService

        with SessionLocal() as db:
            service = KnowledgeGraphService(db)
            result = service.clear_by_book(params["book_id"])
            return ToolResult(success=True, result=result)
    except Exception as e:
        logger.error(f"kg_clear_by_book error: {e}")
        return ToolResult(success=False, error=str(e))


# ── 工具定义（OpenAI function calling schema） ──────────


KG_TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="kg_create_node",
        description="在知识图谱中创建一个新节点（概念/实体）。可以指定名称、描述、类型、领域、所属书籍等信息。",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "节点名称（概念/实体名称）"},
                "description": {"type": "string", "description": "节点描述/定义"},
                "entity_type": {
                    "type": "string",
                    "description": "实体类型，如Concept、Person、Event等",
                    "default": "Concept",
                },
                "domain": {"type": "string", "description": "所属领域"},
                "book_id": {"type": "string", "description": "关联书籍ID"},
                "book_title": {"type": "string", "description": "关联书籍标题"},
                "chapter_index": {"type": "integer", "description": "章节索引"},
                "node_type": {
                    "type": "string",
                    "description": "节点类型：DetailedQuestion或QuickSummary",
                    "default": "DetailedQuestion",
                },
            },
            "required": ["name"],
        },
        handler=kg_create_node,
    ),
    ToolDefinition(
        name="kg_delete_node",
        description="删除知识图谱中的指定节点，同时删除与该节点关联的所有边。",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "要删除的节点ID"},
            },
            "required": ["node_id"],
        },
        handler=kg_delete_node,
    ),
    ToolDefinition(
        name="kg_update_node",
        description="更新知识图谱节点的名称或描述。",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {"type": "string", "description": "节点ID"},
                "name": {"type": "string", "description": "新的节点名称"},
                "description": {"type": "string", "description": "新的节点描述"},
            },
            "required": ["node_id"],
        },
        handler=kg_update_node,
    ),
    ToolDefinition(
        name="kg_search_nodes",
        description="按关键词搜索知识图谱中的节点。返回匹配的节点列表。",
        parameters={
            "type": "object",
            "properties": {
                "keyword": {"type": "string", "description": "搜索关键词"},
                "entity_type": {"type": "string", "description": "按实体类型过滤"},
                "limit": {"type": "integer", "description": "返回结果数量上限", "default": 20},
            },
            "required": ["keyword"],
        },
        handler=kg_search_nodes,
    ),
    ToolDefinition(
        name="kg_create_edge",
        description="在知识图谱中创建一条边（关系），连接两个节点。需要提供源节点ID和目标节点ID。",
        parameters={
            "type": "object",
            "properties": {
                "source_id": {"type": "string", "description": "源节点ID"},
                "target_id": {"type": "string", "description": "目标节点ID"},
                "relation_type": {
                    "type": "string",
                    "description": "关系类型，如RELATES_TO、EXPLAINS、HAS_QUESTION等",
                    "default": "RELATES_TO",
                },
                "edge_type": {
                    "type": "string",
                    "description": "边类型，如BRANCH_EXTEND、SECTION_SEQUENCE等",
                    "default": "BRANCH_EXTEND",
                },
                "description": {"type": "string", "description": "关系描述"},
                "book_id": {"type": "string", "description": "关联书籍ID"},
            },
            "required": ["source_id", "target_id"],
        },
        handler=kg_create_edge,
    ),
    ToolDefinition(
        name="kg_delete_edge",
        description="删除知识图谱中的指定边（关系）。",
        parameters={
            "type": "object",
            "properties": {
                "edge_id": {"type": "string", "description": "要删除的边ID"},
            },
            "required": ["edge_id"],
        },
        handler=kg_delete_edge,
    ),
    ToolDefinition(
        name="kg_get_graph_data",
        description="获取知识图谱数据，包括所有节点和边。可按书籍标题过滤。",
        parameters={
            "type": "object",
            "properties": {
                "book_title": {"type": "string", "description": "按书籍标题过滤（可选）"},
            },
        },
        handler=kg_get_graph_data,
    ),
    ToolDefinition(
        name="kg_get_statistics",
        description="获取知识图谱的统计信息，包括节点总数、边总数、按类型分组的数量等。",
        parameters={"type": "object", "properties": {}},
        handler=kg_get_statistics,
    ),
    ToolDefinition(
        name="kg_clear_by_book",
        description="清除指定书籍的所有知识图谱数据（包括节点和边）。此操作不可撤销，请谨慎使用。",
        parameters={
            "type": "object",
            "properties": {
                "book_id": {"type": "string", "description": "书籍ID"},
            },
            "required": ["book_id"],
        },
        handler=kg_clear_by_book,
    ),
]


def register_kg_tools(registry: ToolRegistry) -> None:
    for tool in KG_TOOLS:
        registry.register(tool)
