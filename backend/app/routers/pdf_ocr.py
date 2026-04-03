from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
import asyncio
from pathlib import Path

from app.services.pdf_ocr_service import pdf_ocr_service, PDFOCRResult
from app.services.paddleocr_service import paddleocr_service, PaddleOCRResult

router = APIRouter()

class ProcessPDFOCRRequest(BaseModel):
    file_path: str
    language: str = "chi_sim+eng"
    deskew: bool = True
    clean: bool = False
    force_ocr: bool = False
    backup: bool = True
    in_place: bool = False

class PDFOCRResponse(BaseModel):
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None
    pages_processed: int = 0
    had_ocr: bool = False

class CheckOCRStatusResponse(BaseModel):
    has_text_layer: bool
    total_pages: int
    needs_ocr: bool

class AvailableLanguagesResponse(BaseModel):
    languages: List[Dict[str, str]]

OCR_STATUS_CACHE = {}

def resolve_file_path(file_path: str) -> str:
    if os.path.isabs(file_path):
        return file_path
    
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    
    possible_paths = [
        file_path,
        os.path.join("uploads", file_path),
        os.path.join("uploads/books", file_path),
        os.path.join(backend_dir, "uploads", file_path),
        os.path.join(backend_dir, "uploads/books", file_path),
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return path
    
    return os.path.join(backend_dir, "uploads/books", file_path)

@router.get("/status/{file_path:path}", response_model=CheckOCRStatusResponse)
async def check_ocr_status(file_path: str):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    has_text, total_pages = await pdf_ocr_service.check_pdf_has_text(resolved_path)
    
    return CheckOCRStatusResponse(
        has_text_layer=has_text,
        total_pages=total_pages,
        needs_ocr=not has_text
    )

@router.get("/languages", response_model=AvailableLanguagesResponse)
async def get_available_languages():
    languages = pdf_ocr_service.get_available_languages()
    
    result = []
    for lang in languages:
        result.append({
            'code': lang,
            'name': pdf_ocr_service.get_language_display_name(lang)
        })
    
    return AvailableLanguagesResponse(languages=result)

@router.post("/process", response_model=PDFOCRResponse)
async def process_pdf_ocr(request: ProcessPDFOCRRequest):
    resolved_path = resolve_file_path(request.file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {request.file_path}")
    
    if request.in_place:
        result = await pdf_ocr_service.process_pdf_in_place(
            resolved_path,
            language=request.language,
            deskew=request.deskew,
            backup=request.backup
        )
    else:
        result = await pdf_ocr_service.process_pdf_with_ocrmypdf(
            resolved_path,
            language=request.language,
            deskew=request.deskew,
            clean=request.clean,
            force_ocr=request.force_ocr
        )
    
    return PDFOCRResponse(
        success=result.success,
        output_path=result.output_path,
        error=result.error,
        pages_processed=result.pages_processed,
        had_ocr=result.had_ocr
    )

@router.post("/process-async/{file_path:path}")
async def process_pdf_ocr_async(
    file_path: str,
    background_tasks: BackgroundTasks,
    language: str = "chi_sim+eng",
    deskew: bool = True,
    backup: bool = True
):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    cache_key = os.path.abspath(resolved_path)
    OCR_STATUS_CACHE[cache_key] = {
        'status': 'processing',
        'progress': 0,
        'error': None
    }
    
    async def process_task():
        try:
            result = await pdf_ocr_service.process_pdf_in_place(
                resolved_path,
                language=language,
                deskew=deskew,
                backup=backup
            )
            
            OCR_STATUS_CACHE[cache_key] = {
                'status': 'completed' if result.success else 'failed',
                'progress': 100,
                'error': result.error,
                'result': result.to_dict()
            }
        except Exception as e:
            OCR_STATUS_CACHE[cache_key] = {
                'status': 'failed',
                'progress': 0,
                'error': str(e)
            }
    
    background_tasks.add_task(process_task)
    
    return {
        "message": "OCR 处理已启动",
        "file_path": file_path,
        "status": "processing"
    }

@router.get("/task-status/{file_path:path}")
async def get_task_status(file_path: str):
    resolved_path = resolve_file_path(file_path)
    cache_key = os.path.abspath(resolved_path)
    
    if cache_key not in OCR_STATUS_CACHE:
        return {
            "status": "not_started",
            "progress": 0,
            "error": None
        }
    
    return OCR_STATUS_CACHE[cache_key]

@router.get("/check-ocrmypdf")
async def check_ocrmypdf():
    return {
        "ocrmypdf_available": pdf_ocr_service.ocrmypdf_available,
        "tesseract_path": pdf_ocr_service.tesseract_path,
        "tessdata_path": pdf_ocr_service.tessdata_path
    }

@router.get("/extract-code/{file_path:path}")
async def extract_code_blocks(file_path: str):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    result = await pdf_ocr_service.extract_text_with_code_detection(resolved_path)
    
    if not result.get('success'):
        raise HTTPException(status_code=500, detail=result.get('error', '提取失败'))
    
    return result

class PaddleOCRResponse(BaseModel):
    success: bool
    text_content: Optional[str] = None
    error: Optional[str] = None
    pages: Optional[List[Dict[str, Any]]] = None
    code_blocks: Optional[List[Dict[str, Any]]] = None
    ocr_results: Optional[List[Dict[str, Any]]] = None

class PaddleOCRStatusResponse(BaseModel):
    model_loaded: bool
    loading: bool = False
    error: Optional[str] = None
    device: Optional[str] = None
    gpu_available: bool = False

@router.get("/paddle/status", response_model=PaddleOCRStatusResponse)
async def get_paddleocr_status():
    status = paddleocr_service.get_status()
    return PaddleOCRStatusResponse(**status)

@router.post("/paddle/load-model")
async def load_paddleocr_model(background_tasks: BackgroundTasks):
    status = paddleocr_service.get_status()
    
    if status.get('model_loaded'):
        return {"message": "PaddleOCR 模型已加载", "status": status}
    
    if status.get('loading'):
        return {"message": "PaddleOCR 模型正在加载中...", "status": status}
    
    background_tasks.add_task(paddleocr_service.load_model_sync)
    
    return {"message": "PaddleOCR 模型加载已启动，请稍后...", "status": paddleocr_service.get_status()}

@router.post("/paddle/process-pdf/{file_path:path}", response_model=PaddleOCRResponse)
async def process_pdf_with_paddle(file_path: str, start_page: int = 0, end_page: int = None):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    result = await paddleocr_service.process_pdf(
        resolved_path,
        start_page=start_page,
        end_page=end_page
    )
    
    return PaddleOCRResponse(
        success=result.success,
        text_content=result.text_content,
        error=result.error,
        pages=result.pages,
        code_blocks=result.code_blocks,
        ocr_results=result.ocr_results
    )

@router.post("/paddle/process-image/{image_path:path}", response_model=PaddleOCRResponse)
async def process_image_with_paddle(image_path: str):
    resolved_path = resolve_file_path(image_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"图片文件不存在: {image_path}")
    
    result = await paddleocr_service.process_image(resolved_path)
    
    return PaddleOCRResponse(
        success=result.success,
        text_content=result.text_content,
        error=result.error,
        pages=result.pages,
        code_blocks=result.code_blocks,
        ocr_results=result.ocr_results
    )

PADDLE_STATUS_CACHE = {}

@router.post("/paddle/process-pdf-async/{file_path:path}")
async def process_pdf_with_paddle_async(
    file_path: str,
    background_tasks: BackgroundTasks,
    start_page: int = 0,
    end_page: int = None
):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    cache_key = os.path.abspath(resolved_path)
    PADDLE_STATUS_CACHE[cache_key] = {
        'status': 'processing',
        'progress': 0,
        'error': None
    }
    
    async def process_task():
        try:
            result = await paddleocr_service.process_pdf(
                resolved_path,
                start_page=start_page,
                end_page=end_page
            )
            
            PADDLE_STATUS_CACHE[cache_key] = {
                'status': 'completed' if result.success else 'failed',
                'progress': 100,
                'error': result.error,
                'result': result.to_dict()
            }
        except Exception as e:
            PADDLE_STATUS_CACHE[cache_key] = {
                'status': 'failed',
                'progress': 0,
                'error': str(e)
            }
    
    background_tasks.add_task(process_task)
    
    return {
        "message": "PaddleOCR 处理已启动",
        "file_path": file_path,
        "status": "processing"
    }

@router.get("/paddle/task-status/{file_path:path}")
async def get_paddle_task_status(file_path: str):
    resolved_path = resolve_file_path(file_path)
    cache_key = os.path.abspath(resolved_path)
    
    if cache_key not in PADDLE_STATUS_CACHE:
        return {
            "status": "not_started",
            "progress": 0,
            "error": None
        }
    
    return PADDLE_STATUS_CACHE[cache_key]

class SmartOCRRequest(BaseModel):
    file_path: str
    output_path: Optional[str] = None
    start_page: int = 0
    end_page: Optional[int] = None

class SmartOCRResponse(BaseModel):
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None
    had_ocr: bool = False
    pages_processed: int = 0
    message: Optional[str] = None
    text_content: Optional[str] = None

@router.post("/paddle/smart-process", response_model=SmartOCRResponse)
async def smart_process_pdf(request: SmartOCRRequest):
    resolved_path = resolve_file_path(request.file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {request.file_path}")
    
    output_path = request.output_path
    if output_path:
        output_path = resolve_file_path(output_path)
    
    result = await paddleocr_service.process_pdf_smart(
        resolved_path,
        output_path=output_path,
        start_page=request.start_page,
        end_page=request.end_page
    )
    
    return SmartOCRResponse(
        success=result.get('success', False),
        output_path=result.get('output_path'),
        error=result.get('error'),
        had_ocr=result.get('had_ocr', False),
        pages_processed=result.get('pages_processed', 0),
        message=result.get('message'),
        text_content=result.get('text_content')
    )

@router.post("/paddle/create-searchable/{file_path:path}", response_model=SmartOCRResponse)
async def create_searchable_pdf(
    file_path: str,
    output_path: Optional[str] = None,
    start_page: int = 0,
    end_page: Optional[int] = None
):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    resolved_output = None
    if output_path:
        resolved_output = resolve_file_path(output_path)
    
    result = await paddleocr_service.create_searchable_pdf(
        resolved_path,
        output_path=resolved_output,
        start_page=start_page,
        end_page=end_page
    )
    
    return SmartOCRResponse(
        success=result.success,
        output_path=resolved_output if result.success else None,
        error=result.error,
        had_ocr=False,
        pages_processed=len(result.pages) if result.success else 0,
        message="双层PDF创建成功" if result.success else f"双层PDF创建失败: {result.error}",
        text_content=result.text_content
    )

SMART_STATUS_CACHE = {}

@router.post("/paddle/smart-process-async/{file_path:path}")
async def smart_process_pdf_async(
    file_path: str,
    background_tasks: BackgroundTasks,
    output_path: Optional[str] = None,
    start_page: int = 0,
    end_page: Optional[int] = None
):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    resolved_output = None
    if output_path:
        resolved_output = resolve_file_path(output_path)
    
    cache_key = os.path.abspath(resolved_path)
    SMART_STATUS_CACHE[cache_key] = {
        'status': 'processing',
        'progress': 0,
        'error': None
    }
    
    async def process_task():
        try:
            result = await paddleocr_service.process_pdf_smart(
                resolved_path,
                output_path=resolved_output,
                start_page=start_page,
                end_page=end_page
            )
            
            SMART_STATUS_CACHE[cache_key] = {
                'status': 'completed' if result.get('success') else 'failed',
                'progress': 100,
                'error': result.get('error'),
                'result': result
            }
        except Exception as e:
            SMART_STATUS_CACHE[cache_key] = {
                'status': 'failed',
                'progress': 0,
                'error': str(e)
            }
    
    background_tasks.add_task(process_task)
    
    return {
        "message": "智能OCR处理已启动",
        "file_path": file_path,
        "status": "processing"
    }

@router.get("/paddle/smart-status/{file_path:path}")
async def get_smart_task_status(file_path: str):
    resolved_path = resolve_file_path(file_path)
    cache_key = os.path.abspath(resolved_path)
    
    if cache_key not in SMART_STATUS_CACHE:
        return {
            "status": "not_started",
            "progress": 0,
            "error": None
        }
    
    return SMART_STATUS_CACHE[cache_key]
