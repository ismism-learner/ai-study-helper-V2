from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
import asyncio
from pathlib import Path

from app.services.ocr_service import ocr_service, OCRPageResult

router = APIRouter()

OCR_CACHE_DIR = "uploads/ocr_cache"
os.makedirs(OCR_CACHE_DIR, exist_ok=True)


class OCRRequest(BaseModel):
    file_path: str
    total_pages: int
    start_page: Optional[int] = 0
    end_page: Optional[int] = None


class OCRPageResultResponse(BaseModel):
    page_number: int
    width: float
    height: float
    blocks: List[Dict[str, Any]]


class OCRResponse(BaseModel):
    file_path: str
    total_pages: int
    results: List[OCRPageResultResponse]
    cached: bool = False


def get_cache_path(file_path: str) -> str:
    file_name = Path(file_path).stem
    return os.path.join(OCR_CACHE_DIR, f"{file_name}_ocr.json")


def load_cached_result(file_path: str) -> Optional[Dict]:
    cache_path = get_cache_path(file_path)
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def save_cached_result(file_path: str, result: Dict):
    cache_path = get_cache_path(file_path)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


@router.post("/process", response_model=OCRResponse)
async def process_ocr(request: OCRRequest):
    file_path = request.file_path
    if not os.path.isabs(file_path):
        possible_paths = [
            file_path,
            os.path.join("uploads", file_path),
            os.path.join("uploads/books", file_path),
        ]
        for path in possible_paths:
            if os.path.exists(path):
                file_path = path
                break
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"PDF文件不存在: {request.file_path}")
    
    cached = load_cached_result(file_path)
    if cached:
        return OCRResponse(
            file_path=request.file_path,
            total_pages=cached['total_pages'],
            results=cached['results'],
            cached=True
        )
    
    try:
        results = await ocr_service.process_pdf(
            file_path,
            start_page=request.start_page or 0,
            end_page=request.end_page
        )
        
        results_data = [r.to_dict() for r in results]
        
        cache_data = {
            'file_path': request.file_path,
            'total_pages': len(results),
            'results': results_data
        }
        save_cached_result(file_path, cache_data)
        
        return OCRResponse(
            file_path=request.file_path,
            total_pages=len(results),
            results=results_data,
            cached=False
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR处理失败: {str(e)}")


@router.post("/process-page")
async def process_single_page(file_path: str, page_number: int):
    if not os.path.isabs(file_path):
        possible_paths = [
            file_path,
            os.path.join("uploads", file_path),
            os.path.join("uploads/books", file_path),
        ]
        for path in possible_paths:
            if os.path.exists(path):
                file_path = path
                break
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"PDF文件不存在: {file_path}")
    
    try:
        result = await ocr_service.process_page(file_path, page_number)
        return result.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR处理失败: {str(e)}")


@router.get("/status/{file_path:path}")
async def get_ocr_status(file_path: str):
    cache_path = get_cache_path(file_path)
    
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            cached = json.load(f)
        return {
            "status": "completed",
            "cached": True,
            "total_pages": cached.get('total_pages', 0)
        }
    
    return {
        "status": "not_processed",
        "cached": False,
        "total_pages": 0
    }


@router.delete("/cache/{file_path:path}")
async def clear_ocr_cache(file_path: str):
    cache_path = get_cache_path(file_path)
    
    if os.path.exists(cache_path):
        os.remove(cache_path)
        return {"message": "OCR缓存已清除"}
    
    return {"message": "未找到OCR缓存"}
