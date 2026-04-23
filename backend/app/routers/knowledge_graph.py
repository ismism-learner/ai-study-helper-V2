from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List

from app.database import get_db
from app.services.sqlite import KnowledgeGraphService

router = APIRouter(prefix="/knowledge-graph", tags=["knowledge-graph"])


def get_service(db=Depends(get_db)) -> KnowledgeGraphService:
    return KnowledgeGraphService(db)


class BookProcessRequest(BaseModel):
    text: str = Field(..., min_length=10)
    title: str = Field(..., min_length=1)
    author: Optional[str] = None
    metadata: Optional[dict] = None


class SearchRequest(BaseModel):
    keyword: str = Field(..., min_length=1)
    entity_type: Optional[str] = None
    limit: int = Field(20, ge=1, le=100)


class QuickSummaryRequest(BaseModel):
    text: str = Field(..., min_length=10)
    book_id: str
    book_title: str
    chapter_index: Optional[int] = None
    text_position: int


class DetailedQuestionRequest(BaseModel):
    text: str = Field(..., min_length=10)
    book_id: str
    book_title: str
    chapter_index: Optional[int] = None
    text_position: int


@router.get("/health")
async def kg_health_check():
    return {
        "status": "healthy",
        "neo4j_enabled": False,
        "storage": "sqlite",
        "stats": {
            "total_nodes": [{"count": 0}],
            "total_relationships": [{"count": 0}],
        },
    }


@router.get("/graph-data")
async def get_graph_data(book_title: Optional[str] = None, service: KnowledgeGraphService = Depends(get_service)):
    try:
        data = service.get_graph_data(book_title)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取图谱数据失败: {str(e)}")


@router.get("/statistics")
async def get_statistics(service: KnowledgeGraphService = Depends(get_service)):
    try:
        stats = service.get_statistics()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@router.post("/search")
async def search_entities(request: SearchRequest, service: KnowledgeGraphService = Depends(get_service)):
    try:
        results = service.search_nodes(
            keyword=request.keyword,
            entity_type=request.entity_type,
            limit=request.limit,
        )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str, service: KnowledgeGraphService = Depends(get_service)):
    try:
        success = service.delete_node(node_id)
        if not success:
            raise HTTPException(status_code=404, detail="节点不存在")
        return {"success": True, "message": "节点已删除"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除节点失败: {str(e)}")


class UpdateNodeRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.put("/nodes/{node_id}")
async def update_node(node_id: str, request: UpdateNodeRequest, service: KnowledgeGraphService = Depends(get_service)):
    try:
        node = service.update_node(node_id, name=request.name, description=request.description)
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        return {
            "success": True,
            "node": {
                "id": node.id,
                "name": node.name,
                "description": node.description,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新节点失败: {str(e)}")


@router.delete("/clear")
async def clear_all(service: KnowledgeGraphService = Depends(get_service)):
    try:
        service.clear_all()
        return {"success": True, "message": "所有数据已清除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除数据失败: {str(e)}")


@router.post("/quick-summary")
async def create_quick_summary(request: QuickSummaryRequest, service: KnowledgeGraphService = Depends(get_service)):
    try:
        from app.services.ai_service import ai_service
        from app.config import settings_manager
        
        prompt = settings_manager.quick_summary_prompt
        full_prompt = f"{prompt}\n\n【文本内容】\n{request.text}"
        
        content = await ai_service.generate_text(full_prompt)
        
        import json
        import re
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', content, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(1))
        else:
            json_match = re.search(r'\{[^{}]*"label"[^{}]*\}', content, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = {"label": "快速梳理", "definition": content, "key_concepts": [], "structure": []}
        
        node = service.create_node(
            name=data.get("label", "快速梳理"),
            description=data.get("definition", ""),
            entity_type="QuickSummary",
            book_id=request.book_id,
            book_title=request.book_title,
            chapter_index=request.chapter_index,
            node_type="QuickSummary",
            text_position=request.text_position,
            extra_data={
                "key_concepts": data.get("key_concepts", []),
                "structure": data.get("structure", []),
            },
        )
        
        return {
            "success": True,
            "node": {
                "id": node.id,
                "name": node.name,
                "description": node.description,
                "node_type": node.node_type,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建快速梳理失败: {str(e)}")


@router.post("/detailed-question")
async def create_detailed_question(request: DetailedQuestionRequest, service: KnowledgeGraphService = Depends(get_service)):
    try:
        from app.services.ai_service import ai_service
        from app.config import settings_manager
        
        prompt = settings_manager.kg_concept_prompt
        full_prompt = f"{prompt}\n\n【文本内容】\n{request.text}"
        
        content = await ai_service.generate_text(full_prompt)
        
        import json
        import re
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', content, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(1))
        else:
            json_match = re.search(r'\{[^{}]*"label"[^{}]*\}', content, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = {"label": "概念", "definition": content, "domain": "", "key_concepts": [], "suggested_questions": []}
        
        node = service.create_detailed_question(
            name=data.get("label", "概念"),
            description=data.get("definition", ""),
            book_id=request.book_id,
            book_title=request.book_title,
            chapter_index=request.chapter_index,
            text_position=request.text_position,
            extra_data={
                "domain": data.get("domain", ""),
                "key_concepts": data.get("key_concepts", []),
                "suggested_questions": data.get("suggested_questions", []),
            },
        )
        
        return {
            "success": True,
            "node": {
                "id": node.id,
                "name": node.name,
                "description": node.description,
                "node_type": node.node_type,
                "parent_summary_id": node.parent_summary_id,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建详细提问失败: {str(e)}")
