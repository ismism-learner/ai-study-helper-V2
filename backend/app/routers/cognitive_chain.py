from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional

from app.database import get_db
from app.services.sqlite import CognitiveChainService

router = APIRouter(prefix="/cognitive-chains", tags=["cognitive-chains"])


def get_service(db=Depends(get_db)) -> CognitiveChainService:
    return CognitiveChainService(db)


class CreateChainRequest(BaseModel):
    root_concept: str = Field(..., min_length=1)
    context: str = ""
    user_id: Optional[str] = None
    source_doc_id: Optional[str] = None
    source_doc_title: Optional[str] = None
    source_chapter_index: Optional[int] = None


class ExpandChainRequest(BaseModel):
    chain_id: str = Field(...)
    parent_node_id: str = Field(...)
    concept_to_explain: str = Field(..., min_length=1)
    context: str = ""
    source_doc_id: Optional[str] = None
    source_doc_title: Optional[str] = None
    source_chapter_index: Optional[int] = None


class ExplainConceptRequest(BaseModel):
    concept: str = Field(..., min_length=1)
    context: str = ""


@router.post("/create")
async def create_chain(request: CreateChainRequest, service: CognitiveChainService = Depends(get_service)):
    try:
        chain = await service.create_chain(
            root_concept=request.root_concept,
            context=request.context,
            user_id=request.user_id,
            book_id=request.source_doc_id,
            book_title=request.source_doc_title,
            chapter_index=request.source_chapter_index,
        )
        return chain
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建认知链失败: {str(e)}")


@router.post("/expand")
async def expand_chain(request: ExpandChainRequest, service: CognitiveChainService = Depends(get_service)):
    try:
        node = await service.expand_chain(
            chain_id=request.chain_id,
            parent_node_id=request.parent_node_id,
            concept_to_explain=request.concept_to_explain,
            context=request.context,
            book_id=request.source_doc_id,
            book_title=request.source_doc_title,
            chapter_index=request.source_chapter_index,
        )
        return node
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"扩展认知链失败: {str(e)}")


@router.post("/explain")
async def explain_concept(request: ExplainConceptRequest, service: CognitiveChainService = Depends(get_service)):
    try:
        explanation = await service.explain_concept(
            concept=request.concept,
            context=request.context,
        )
        return explanation
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解释概念失败: {str(e)}")


@router.get("/user/{user_id}")
async def get_user_chains(user_id: str, limit: int = 20, service: CognitiveChainService = Depends(get_service)):
    try:
        chains = service.get_user_chains(user_id, limit)
        return {"chains": chains}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取用户认知链失败: {str(e)}")


@router.get("/source-doc/{source_doc_id}")
async def get_chains_by_source_doc(source_doc_id: str, limit: int = 50, service: CognitiveChainService = Depends(get_service)):
    try:
        chains = service.get_chains_by_book(source_doc_id, limit)
        return {"chains": chains}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取书籍认知链失败: {str(e)}")


@router.get("/{chain_id}")
async def get_chain(chain_id: str, service: CognitiveChainService = Depends(get_service)):
    try:
        chain = service.get_chain_dict(chain_id)
        if not chain:
            raise HTTPException(status_code=404, detail="认知链不存在")
        return chain
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取认知链失败: {str(e)}")


@router.delete("/{chain_id}")
async def delete_chain(chain_id: str, service: CognitiveChainService = Depends(get_service)):
    try:
        success = service.delete_chain(chain_id)
        if not success:
            raise HTTPException(status_code=404, detail="认知链不存在")
        return {"success": True, "message": "认知链已删除"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除认知链失败: {str(e)}")
