from fastapi import APIRouter, HTTPException, BackgroundTasks, Body
from fastapi.responses import FileResponse
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
    file_path = file_path.replace('/', os.sep).replace('\\', os.sep)
    
    if os.path.isabs(file_path):
        if os.path.exists(file_path):
            return file_path
    
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    
    normalized_path = file_path
    for prefix in ['uploads' + os.sep, 'uploads' + os.sep + 'books' + os.sep]:
        if normalized_path.startswith(prefix):
            normalized_path = normalized_path[len(prefix):]
    
    possible_paths = [
        file_path,
        normalized_path,
        os.path.join("uploads", file_path),
        os.path.join("uploads", normalized_path),
        os.path.join("uploads", "books", file_path),
        os.path.join("uploads", "books", normalized_path),
        os.path.join(backend_dir, "uploads", file_path),
        os.path.join(backend_dir, "uploads", normalized_path),
        os.path.join(backend_dir, "uploads", "books", file_path),
        os.path.join(backend_dir, "uploads", "books", normalized_path),
    ]
    
    unique_paths = []
    seen = set()
    for path in possible_paths:
        if path not in seen:
            seen.add(path)
            unique_paths.append(path)
    
    for path in unique_paths:
        if os.path.exists(path):
            return path
    
    return os.path.join(backend_dir, "uploads", "books", normalized_path)

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

IN_PLACE_STATUS_CACHE = {}

@router.post("/paddle/make-searchable/{file_path:path}", response_model=SmartOCRResponse)
async def make_pdf_searchable_in_place(
    file_path: str,
    start_page: int = 0,
    end_page: Optional[int] = None
):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    result = await paddleocr_service.create_searchable_pdf_in_place(
        resolved_path,
        start_page=start_page,
        end_page=end_page
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

@router.post("/paddle/make-searchable-async/{file_path:path}")
async def make_pdf_searchable_in_place_async(
    file_path: str,
    background_tasks: BackgroundTasks,
    start_page: int = 0,
    end_page: Optional[int] = None
):
    resolved_path = resolve_file_path(file_path)
    
    if not os.path.exists(resolved_path):
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    cache_key = os.path.abspath(resolved_path)
    IN_PLACE_STATUS_CACHE[cache_key] = {
        'status': 'initializing',
        'progress': 0,
        'current_page': 0,
        'total_pages': 0,
        'error': None,
        'message': '正在初始化...'
    }
    
    async def process_task():
        try:
            IN_PLACE_STATUS_CACHE[cache_key]['status'] = 'loading_model'
            IN_PLACE_STATUS_CACHE[cache_key]['message'] = '正在加载 OCR 模型...'
            
            async def progress_callback(progress: int, current_page: int, total_pages: int):
                IN_PLACE_STATUS_CACHE[cache_key]['progress'] = progress
                IN_PLACE_STATUS_CACHE[cache_key]['current_page'] = current_page
                IN_PLACE_STATUS_CACHE[cache_key]['total_pages'] = total_pages
                IN_PLACE_STATUS_CACHE[cache_key]['message'] = f'正在处理第 {current_page}/{total_pages} 页...'
            
            async def status_callback(status: str, progress: int, message: str):
                IN_PLACE_STATUS_CACHE[cache_key]['status'] = status
                IN_PLACE_STATUS_CACHE[cache_key]['progress'] = progress
                IN_PLACE_STATUS_CACHE[cache_key]['message'] = message
            
            result = await paddleocr_service.create_searchable_pdf_in_place(
                resolved_path,
                start_page=start_page,
                end_page=end_page,
                progress_callback=progress_callback,
                status_callback=status_callback
            )
            
            IN_PLACE_STATUS_CACHE[cache_key] = {
                'status': 'completed' if result.get('success') else 'failed',
                'progress': 100,
                'current_page': result.get('pages_processed', 0),
                'total_pages': result.get('pages_processed', 0),
                'error': result.get('error'),
                'message': result.get('message'),
                'result': result
            }
            
        except Exception as e:
            IN_PLACE_STATUS_CACHE[cache_key] = {
                'status': 'failed',
                'progress': 0,
                'current_page': 0,
                'total_pages': 0,
                'error': str(e),
                'message': f'处理失败: {str(e)}'
            }
    
    background_tasks.add_task(process_task)
    
    return {
        "message": "OCR 处理已启动",
        "file_path": file_path,
        "status": "processing"
    }

@router.get("/paddle/make-searchable-status/{file_path:path}")
async def get_make_searchable_status(file_path: str):
    resolved_path = resolve_file_path(file_path)
    cache_key = os.path.abspath(resolved_path)
    
    if cache_key not in IN_PLACE_STATUS_CACHE:
        return {
            "status": "not_started",
            "progress": 0,
            "current_page": 0,
            "total_pages": 0,
            "error": None,
            "message": "尚未开始处理",
            "had_text": False,
            "text_file_path": None
        }
    
    return IN_PLACE_STATUS_CACHE[cache_key]

EXTRACT_TEXT_STATUS_CACHE = {}

@router.post("/paddle/extract-text-async/{file_path:path}")
async def extract_text_from_pdf_async(
    file_path: str,
    background_tasks: BackgroundTasks,
    start_page: int = 0,
    end_page: Optional[int] = None,
    concurrency: int = 1
):
    print(f"\n{'='*60}")
    print(f"[OCR API] 收到 OCR 请求")
    print(f"[OCR API] 原始文件路径: {file_path}")
    print(f"[OCR API] start_page: {start_page}, end_page: {end_page}")
    print(f"[OCR API] concurrency: {concurrency}")
    
    if concurrency < 1:
        concurrency = 1
    if concurrency > 5:
        concurrency = 5
    
    resolved_path = resolve_file_path(file_path)
    print(f"[OCR API] 解析后路径: {resolved_path}")
    print(f"[OCR API] 文件存在: {os.path.exists(resolved_path)}")
    
    if not os.path.exists(resolved_path):
        print(f"[OCR API] 错误: PDF 文件不存在")
        raise HTTPException(status_code=404, detail=f"PDF 文件不存在: {file_path}")
    
    cache_key = os.path.abspath(resolved_path)
    print(f"[OCR API] 缓存键: {cache_key}")
    
    # 检查是否已有任务在运行
    if cache_key in EXTRACT_TEXT_STATUS_CACHE:
        existing_status = EXTRACT_TEXT_STATUS_CACHE[cache_key]
        if existing_status.get('status') in ['initializing', 'loading_model', 'processing']:
            print(f"[OCR API] ⚠️ 检测到重复任务，当前状态: {existing_status.get('status')}")
            print(f"[OCR API] 返回现有任务状态，不启动新任务")
            return {
                "message": "OCR 任务已在运行中",
                "file_path": file_path,
                "status": existing_status.get('status'),
                "progress": existing_status.get('progress', 0),
                "current_page": existing_status.get('current_page', 0),
                "total_pages": existing_status.get('total_pages', 0)
            }
    
    print(f"[OCR API] 启动后台任务...")
    
    EXTRACT_TEXT_STATUS_CACHE[cache_key] = {
        'status': 'initializing',
        'progress': 0,
        'current_page': 0,
        'total_pages': 0,
        'error': None,
        'message': '正在初始化...',
        'concurrency': concurrency
    }
    
    async def process_task():
        try:
            print(f"\n[OCR TASK] ========== 后台任务开始 ==========")
            print(f"[OCR TASK] 文件: {cache_key}")
            print(f"[OCR TASK] 并行数: {concurrency}")
            
            EXTRACT_TEXT_STATUS_CACHE[cache_key]['status'] = 'loading_model'
            EXTRACT_TEXT_STATUS_CACHE[cache_key]['message'] = '正在加载 OCR 模型...'
            print(f"[OCR TASK] 状态: loading_model")
            
            async def progress_callback(progress: int, current_page: int, total_pages: int):
                print(f"[OCR TASK] 进度: {progress}%, 页面 {current_page}/{total_pages}")
                EXTRACT_TEXT_STATUS_CACHE[cache_key]['progress'] = progress
                EXTRACT_TEXT_STATUS_CACHE[cache_key]['current_page'] = current_page
                EXTRACT_TEXT_STATUS_CACHE[cache_key]['total_pages'] = total_pages
                EXTRACT_TEXT_STATUS_CACHE[cache_key]['message'] = f'正在处理第 {current_page}/{total_pages} 页...'
            
            async def status_callback(status: str, progress: int, message: str):
                print(f"[OCR TASK] 状态更新: {status}, {message}")
                EXTRACT_TEXT_STATUS_CACHE[cache_key]['status'] = status
                EXTRACT_TEXT_STATUS_CACHE[cache_key]['progress'] = progress
                EXTRACT_TEXT_STATUS_CACHE[cache_key]['message'] = message
            
            print(f"[OCR TASK] 调用 paddleocr_service.extract_text_from_pdf...")
            result = await paddleocr_service.extract_text_from_pdf(
                resolved_path,
                start_page=start_page,
                end_page=end_page,
                progress_callback=progress_callback,
                status_callback=status_callback,
                concurrency=concurrency
            )
            
            print(f"\n[OCR TASK] ========== 处理结果 ==========")
            print(f"[OCR TASK] success: {result.get('success')}")
            print(f"[OCR TASK] pages_processed: {result.get('pages_processed')}")
            print(f"[OCR TASK] text_content 长度: {len(result.get('text_content', ''))}")
            print(f"[OCR TASK] text_file_path: {result.get('text_file_path')}")
            print(f"[OCR TASK] error: {result.get('error')}")
            
            EXTRACT_TEXT_STATUS_CACHE[cache_key] = {
                'status': 'completed' if result.get('success') else 'failed',
                'progress': 100,
                'current_page': result.get('pages_processed', 0),
                'total_pages': result.get('pages_processed', 0),
                'error': result.get('error'),
                'message': result.get('message'),
                'had_text': result.get('had_text', False),
                'text_content': result.get('text_content'),
                'text_file_path': result.get('text_file_path'),
                'pages': result.get('pages', [])
            }
            
        except Exception as e:
            print(f"\n[OCR TASK] ========== 处理异常 ==========")
            print(f"[OCR TASK] 错误: {e}")
            import traceback
            traceback.print_exc()
            EXTRACT_TEXT_STATUS_CACHE[cache_key] = {
                'status': 'failed',
                'progress': 0,
                'current_page': 0,
                'total_pages': 0,
                'error': str(e),
                'message': f'处理失败: {str(e)}'
            }
    
    background_tasks.add_task(process_task)
    
    return {
        "message": "OCR 文字提取已启动",
        "file_path": file_path,
        "status": "processing"
    }

@router.get("/paddle/extract-text-status/{file_path:path}")
async def get_extract_text_status(file_path: str):
    resolved_path = resolve_file_path(file_path)
    cache_key = os.path.abspath(resolved_path)
    
    if cache_key not in EXTRACT_TEXT_STATUS_CACHE:
        return {
            "status": "not_started",
            "progress": 0,
            "current_page": 0,
            "total_pages": 0,
            "error": None,
            "message": "尚未开始处理",
            "had_text": False,
            "text_content": None,
            "text_file_path": None
        }
    
    return EXTRACT_TEXT_STATUS_CACHE[cache_key]

@router.get("/paddle/ocr-text/{file_path:path}")
async def get_ocr_text_file(file_path: str):
    resolved_path = resolve_file_path(file_path)
    
    base, ext = os.path.splitext(resolved_path)
    text_file_path = f"{base}_ocr_text.txt"
    
    if not os.path.exists(text_file_path):
        raise HTTPException(status_code=404, detail="OCR 文字文件不存在，请先进行 OCR 处理")
    
    return FileResponse(
        text_file_path,
        media_type="text/plain; charset=utf-8",
        filename=os.path.basename(text_file_path)
    )

@router.get("/paddle/has-ocr-text/{file_path:path}")
async def check_has_ocr_text(file_path: str):
    resolved_path = resolve_file_path(file_path)
    
    base, ext = os.path.splitext(resolved_path)
    text_file_path = f"{base}_ocr_text.txt"
    
    has_ocr = os.path.exists(text_file_path)
    
    if has_ocr:
        file_stat = os.stat(text_file_path)
        return {
            "has_ocr_text": True,
            "text_file_path": text_file_path,
            "file_size": file_stat.st_size,
            "modified_time": file_stat.st_mtime
        }
    
    return {
        "has_ocr_text": False,
        "text_file_path": None
    }

@router.get("/paddle/gpu-status")
async def get_gpu_status():
    gpu_util, mem_used, mem_total = paddleocr_service.get_gpu_status()
    
    current_concurrency = 1
    for cache_key, status in EXTRACT_TEXT_STATUS_CACHE.items():
        if status.get('status') in ['processing', 'loading_model', 'initializing']:
            current_concurrency = status.get('concurrency', 1)
            break
    
    return {
        "gpu_utilization": gpu_util,
        "memory_used": mem_used,
        "memory_total": mem_total,
        "memory_percent": (mem_used / mem_total * 100) if mem_total > 0 else 0,
        "concurrent_workers": current_concurrency
    }

@router.post("/paddle/cancel-ocr/{file_path:path}")
async def cancel_ocr_process(file_path: str):
    resolved_path = resolve_file_path(file_path)
    cache_key = os.path.abspath(resolved_path)
    
    cancelled = False
    active_statuses = ['initializing', 'loading_model', 'processing']
    
    if cache_key in EXTRACT_TEXT_STATUS_CACHE:
        status = EXTRACT_TEXT_STATUS_CACHE[cache_key]
        if status.get('status') in active_statuses:
            status['status'] = 'cancelled'
            status['message'] = '用户取消处理'
            cancelled = True
    
    if cache_key in IN_PLACE_STATUS_CACHE:
        status = IN_PLACE_STATUS_CACHE[cache_key]
        if status.get('status') in active_statuses:
            status['status'] = 'cancelled'
            status['message'] = '用户取消处理'
            cancelled = True
    
    paddleocr_service.cancel_processing()
    
    return {
        "success": cancelled,
        "message": "已取消OCR处理" if cancelled else "没有正在进行的OCR任务"
    }

@router.get("/paddle/ocr-progress/{file_path:path}")
async def get_ocr_progress(file_path: str):
    resolved_path = resolve_file_path(file_path)
    
    base, ext = os.path.splitext(resolved_path)
    progress_file = f"{base}_ocr_progress.json"
    
    if os.path.exists(progress_file):
        import json
        with open(progress_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    return {
        "last_processed_page": 0,
        "total_pages": 0,
        "has_progress": False
    }

@router.post("/paddle/save-ocr-text/{file_path:path}")
async def save_ocr_text(file_path: str, text_content: str = Body("", embed=True)):
    resolved_path = resolve_file_path(file_path)
    
    base, ext = os.path.splitext(resolved_path)
    text_file_path = f"{base}_ocr_text.txt"
    
    try:
        with open(text_file_path, 'w', encoding='utf-8') as f:
            f.write(text_content)
        
        return {
            "success": True,
            "message": "OCR文字已保存",
            "text_file_path": text_file_path
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.delete("/paddle/delete-ocr-text/{file_path:path}")
async def delete_ocr_text(file_path: str):
    resolved_path = resolve_file_path(file_path)
    
    base, ext = os.path.splitext(resolved_path)
    text_file_path = f"{base}_ocr_text.txt"
    progress_file = f"{base}_ocr_progress.json"
    
    deleted = False
    files_deleted = []
    
    if os.path.exists(text_file_path):
        try:
            os.remove(text_file_path)
            files_deleted.append(text_file_path)
        except:
            pass
    
    if os.path.exists(progress_file):
        try:
            os.remove(progress_file)
            files_deleted.append(progress_file)
        except:
            pass
    
    if files_deleted:
        return {
            "success": True,
            "message": f"已删除 {len(files_deleted)} 个文件",
            "files": files_deleted
        }
    
    return {
            "success": False,
            "message": "未找到 OCR 文件"
        }


@router.post("/paddle/clear-cache")
async def clear_ocr_cache():
    """清理所有OCR状态缓存"""
    global EXTRACT_TEXT_STATUS_CACHE, IN_PLACE_STATUS_CACHE, PADDLE_STATUS_CACHE, SMART_STATUS_CACHE
    
    cleared_count = 0
    cleared_count += len(EXTRACT_TEXT_STATUS_CACHE)
    cleared_count += len(IN_PLACE_STATUS_CACHE)
    cleared_count += len(PADDLE_STATUS_CACHE)
    cleared_count += len(SMART_STATUS_CACHE)
    
    EXTRACT_TEXT_STATUS_CACHE.clear()
    IN_PLACE_STATUS_CACHE.clear()
    PADDLE_STATUS_CACHE.clear()
    SMART_STATUS_CACHE.clear()
    
    return {
        "success": True,
        "message": f"已清理 {cleared_count} 个缓存项",
        "cleared_count": cleared_count
    }


@router.get("/paddle/cache-status")
async def get_cache_status():
    """获取所有缓存的状态"""
    return {
        "extract_text_cache": {
            "count": len(EXTRACT_TEXT_STATUS_CACHE),
            "keys": list(EXTRACT_TEXT_STATUS_CACHE.keys()),
            "statuses": {k: v.get('status') for k, v in EXTRACT_TEXT_STATUS_CACHE.items()}
        },
        "in_place_cache": {
            "count": len(IN_PLACE_STATUS_CACHE),
            "keys": list(IN_PLACE_STATUS_CACHE.keys())
        },
        "paddle_cache": {
            "count": len(PADDLE_STATUS_CACHE),
            "keys": list(PADDLE_STATUS_CACHE.keys())
        },
        "smart_cache": {
            "count": len(SMART_STATUS_CACHE),
            "keys": list(SMART_STATUS_CACHE.keys())
        }
    }
