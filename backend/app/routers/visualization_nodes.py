"""
可视化节点API - 处理代码块的AI规范化、节点管理和本地存储
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ChapterNote, VisualizationNode
from app.services.ai_service import ai_service

router = APIRouter(prefix="/visualization-nodes", tags=["visualization-nodes"])


# ========== Pydantic Schemas ==========


class NodePosition(BaseModel):
    x: float
    y: float
    width: int = 300
    height: int = 200


class NodeConnection(BaseModel):
    target_id: str
    type: str  # input, output, reference
    label: str | None = None


class CreateNodeRequest(BaseModel):
    book_id: str | None = None
    chapter_note_id: str | None = None
    node_type: str  # formula, code, chart, geometry
    title: str
    description: str | None = None
    source_content: str
    language: str | None = None
    confidence: str = "high"


class UpdateNodeRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    position: NodePosition | None = None
    connections: list[NodeConnection] | None = None
    is_active: bool | None = None


class NormalizeRequest(BaseModel):
    source_content: str
    node_type: str
    language: str | None = None


class NodeResponse(BaseModel):
    id: str
    book_id: str | None
    chapter_note_id: str | None
    node_type: str
    title: str
    description: str | None
    source_content: str
    normalized_content: str | None
    render_config: dict | None
    position_x: float
    position_y: float
    width: int
    height: int
    connections: list[dict] | None
    language: str | None
    confidence: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ========== AI规范化提示词 ==========

NORMALIZE_SYSTEM_PROMPT = """你是一个代码规范化助手。你的任务是将代码块转换为标准化的、可渲染的格式。

【任务目标】
将输入的代码/公式转换为：
1. 标准化的代码格式
2. 渲染配置（JSON格式）
3. 简短描述

【输出格式】
请严格按照以下JSON格式输出：
{
  "normalized_content": "标准化后的代码内容",
  "render_config": {
    "type": "渲染类型",
    "params": {具体参数}
  },
  "description": "简短描述这段代码的作用"
}

【不同类型的处理方式】

1. 公式 (formula/latex):
   - 确保LaTeX语法正确
   - render_config示例: {"type": "katex", "display": "block"}

2. 代码 (code/python/javascript):
   - 格式化代码缩进
   - 添加必要注释
   - render_config示例: {"type": "code", "language": "python", "executable": true}

3. 图表 (chart):
   - 提取图表类型和数据结构
   - render_config示例: {"type": "line", "xAxis": "时间", "yAxis": "数值"}

4. 几何 (geometry):
   - 提取几何图形参数
   - render_config示例: {"type": "function", "expression": "y = x^2", "range": [-10, 10]}

只输出JSON，不要添加其他内容。"""


# ========== API Endpoints ==========


@router.post("/normalize", response_model=dict)
async def normalize_content(request: NormalizeRequest):
    """
    AI规范化处理代码块
    将原始代码转换为标准化格式和渲染配置
    """
    try:
        prompt = f"""请规范化以下内容：

类型: {request.node_type}
语言: {request.language or "未知"}

原始内容:
{request.source_content}

请输出规范化后的JSON配置。"""

        result = await ai_service.generate_text(
            prompt=prompt, system_prompt=NORMALIZE_SYSTEM_PROMPT
        )

        # 解析JSON结果
        import json

        try:
            # 尝试提取JSON部分
            json_start = result.find("{")
            json_end = result.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = result[json_start:json_end]
                normalized = json.loads(json_str)
            else:
                normalized = json.loads(result)
        except json.JSONDecodeError:
            # 如果解析失败，返回原始内容
            normalized = {
                "normalized_content": request.source_content,
                "render_config": {"type": request.node_type},
                "description": "AI规范化失败，使用原始内容",
            }

        return {"success": True, "result": normalized}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI规范化失败: {str(e)}")


@router.post("/", response_model=NodeResponse)
async def create_node(request: CreateNodeRequest, db: Session = Depends(get_db)):
    """创建新的可视化节点"""
    node = VisualizationNode(
        book_id=request.book_id,
        chapter_note_id=request.chapter_note_id,
        node_type=request.node_type,
        title=request.title,
        description=request.description,
        source_content=request.source_content,
        language=request.language,
        confidence=request.confidence,
    )

    db.add(node)
    db.commit()
    db.refresh(node)

    return NodeResponse(
        id=node.id,
        book_id=node.book_id,
        chapter_note_id=node.chapter_note_id,
        node_type=node.node_type,
        title=node.title,
        description=node.description,
        source_content=node.source_content,
        normalized_content=node.normalized_content,
        render_config=node.render_config,
        position_x=node.position_x,
        position_y=node.position_y,
        width=node.width,
        height=node.height,
        connections=node.connections,
        language=node.language,
        confidence=node.confidence,
        is_active=bool(node.is_active),
        created_at=node.created_at,
        updated_at=node.updated_at,
    )


@router.post("/{node_id}/normalize", response_model=NodeResponse)
async def normalize_node(node_id: str, db: Session = Depends(get_db)):
    """对现有节点进行AI规范化处理"""
    node = db.query(VisualizationNode).filter(VisualizationNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")

    try:
        prompt = f"""请规范化以下内容：

类型: {node.node_type}
语言: {node.language or "未知"}

原始内容:
{node.source_content}

请输出规范化后的JSON配置。"""

        result = await ai_service.generate_text(
            prompt=prompt, system_prompt=NORMALIZE_SYSTEM_PROMPT
        )

        import json

        try:
            json_start = result.find("{")
            json_end = result.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = result[json_start:json_end]
                normalized = json.loads(json_str)
            else:
                normalized = json.loads(result)
        except json.JSONDecodeError:
            normalized = {
                "normalized_content": node.source_content,
                "render_config": {"type": node.node_type},
                "description": "AI规范化失败",
            }

        # 更新节点
        node.normalized_content = normalized.get("normalized_content")
        node.render_config = normalized.get("render_config")
        if normalized.get("description"):
            node.description = normalized.get("description")

        db.commit()
        db.refresh(node)

        return NodeResponse(
            id=node.id,
            book_id=node.book_id,
            chapter_note_id=node.chapter_note_id,
            node_type=node.node_type,
            title=node.title,
            description=node.description,
            source_content=node.source_content,
            normalized_content=node.normalized_content,
            render_config=node.render_config,
            position_x=node.position_x,
            position_y=node.position_y,
            width=node.width,
            height=node.height,
            connections=node.connections,
            language=node.language,
            confidence=node.confidence,
            is_active=bool(node.is_active),
            created_at=node.created_at,
            updated_at=node.updated_at,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI规范化失败: {str(e)}")


@router.get("/", response_model=list[NodeResponse])
async def list_nodes(
    book_id: str | None = None,
    chapter_note_id: str | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    """获取节点列表"""
    query = db.query(VisualizationNode)

    if book_id:
        query = query.filter(VisualizationNode.book_id == book_id)
    if chapter_note_id:
        query = query.filter(VisualizationNode.chapter_note_id == chapter_note_id)
    if is_active is not None:
        query = query.filter(VisualizationNode.is_active == (1 if is_active else 0))

    nodes = query.all()

    return [
        NodeResponse(
            id=n.id,
            book_id=n.book_id,
            chapter_note_id=n.chapter_note_id,
            node_type=n.node_type,
            title=n.title,
            description=n.description,
            source_content=n.source_content,
            normalized_content=n.normalized_content,
            render_config=n.render_config,
            position_x=n.position_x,
            position_y=n.position_y,
            width=n.width,
            height=n.height,
            connections=n.connections,
            language=n.language,
            confidence=n.confidence,
            is_active=bool(n.is_active),
            created_at=n.created_at,
            updated_at=n.updated_at,
        )
        for n in nodes
    ]


@router.patch("/{node_id}", response_model=NodeResponse)
async def update_node(
    node_id: str, request: UpdateNodeRequest, db: Session = Depends(get_db)
):
    """更新节点（位置、连接等）"""
    node = db.query(VisualizationNode).filter(VisualizationNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")

    if request.title is not None:
        node.title = request.title
    if request.description is not None:
        node.description = request.description
    if request.position is not None:
        node.position_x = request.position.x
        node.position_y = request.position.y
        node.width = request.position.width
        node.height = request.position.height
    if request.connections is not None:
        node.connections = [c.model_dump() for c in request.connections]
    if request.is_active is not None:
        node.is_active = 1 if request.is_active else 0

    db.commit()
    db.refresh(node)

    return NodeResponse(
        id=node.id,
        book_id=node.book_id,
        chapter_note_id=node.chapter_note_id,
        node_type=node.node_type,
        title=node.title,
        description=node.description,
        source_content=node.source_content,
        normalized_content=node.normalized_content,
        render_config=node.render_config,
        position_x=node.position_x,
        position_y=node.position_y,
        width=node.width,
        height=node.height,
        connections=node.connections,
        language=node.language,
        confidence=node.confidence,
        is_active=bool(node.is_active),
        created_at=node.created_at,
        updated_at=node.updated_at,
    )


@router.delete("/{node_id}")
async def delete_node(node_id: str, db: Session = Depends(get_db)):
    """删除节点"""
    node = db.query(VisualizationNode).filter(VisualizationNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")

    db.delete(node)
    db.commit()

    return {"success": True, "message": "节点已删除"}


@router.post("/batch-save")
async def batch_save_nodes(nodes: list[dict], db: Session = Depends(get_db)):
    """批量保存节点位置和配置（用于画布保存）"""
    for node_data in nodes:
        node = (
            db.query(VisualizationNode)
            .filter(VisualizationNode.id == node_data["id"])
            .first()
        )
        if node:
            if "position" in node_data:
                node.position_x = node_data["position"].get("x", node.position_x)
                node.position_y = node_data["position"].get("y", node.position_y)
                node.width = node_data["position"].get("width", node.width)
                node.height = node_data["position"].get("height", node.height)
            if "connections" in node_data:
                node.connections = node_data["connections"]
            if "is_active" in node_data:
                node.is_active = 1 if node_data["is_active"] else 0

    db.commit()

    return {"success": True, "message": f"已保存 {len(nodes)} 个节点"}
