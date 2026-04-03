import os
import sys
import json
import logging
import tempfile
import asyncio
import threading
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

class PaddleOCRResult:
    def __init__(self, success: bool, text_content: str = "", 
                 error: str = None, pages: List[Dict] = None, 
                 code_blocks: List[Dict] = None,
                 ocr_results: List[Dict] = None):
        self.success = success
        self.text_content = text_content
        self.error = error
        self.pages = pages or []
        self.code_blocks = code_blocks or []
        self.ocr_results = ocr_results or []
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'success': self.success,
            'text_content': self.text_content,
            'error': self.error,
            'pages': self.pages,
            'code_blocks': self.code_blocks,
            'ocr_results': self.ocr_results
        }

class PaddleOCRService:
    def __init__(self):
        self.ocr = None
        self.model_loaded = False
        self._loading = False
        self._load_error = None
        self.device = None
        self._use_gpu = False
        self._lock = threading.Lock()
        
    def _check_gpu_available(self) -> Tuple[bool, str]:
        try:
            import paddle
            if paddle.is_compiled_with_cuda():
                gpu_count = paddle.device.cuda.device_count()
                if gpu_count > 0:
                    gpu_name = paddle.device.cuda.get_device_name(0)
                    logger.info(f"PaddlePaddle GPU available: {gpu_name}")
                    return True, "gpu"
            logger.info("PaddlePaddle GPU not available, using CPU")
            return False, "cpu"
        except Exception as e:
            logger.warning(f"Error checking GPU: {e}")
            return False, "cpu"
    
    def _do_load_model(self) -> bool:
        try:
            import paddle
            
            self._use_gpu, self.device = self._check_gpu_available()
            
            if self._use_gpu:
                paddle.device.set_device("gpu:0")
                logger.info("Set paddle device to GPU:0")
            
            from paddleocr import PaddleOCR
            
            logger.info("Initializing PaddleOCR...")
            self.ocr = PaddleOCR(
                use_angle_cls=True,
                lang='ch',
                use_gpu=self._use_gpu,
                show_log=False
            )
            
            if self.ocr is None:
                raise Exception("PaddleOCR 初始化返回 None")
            
            self.model_loaded = True
            logger.info(f"PaddleOCR model loaded successfully on {self.device}")
            return True
            
        except Exception as e:
            self._load_error = str(e) if str(e) else f"加载失败: {type(e).__name__}"
            logger.error(f"Failed to load PaddleOCR model: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def load_model_sync(self):
        with self._lock:
            if self.model_loaded:
                return True
            
            if self._loading:
                logger.warning("Model is already loading...")
                return False
            
            self._loading = True
            self._load_error = None
            
            try:
                result = self._do_load_model()
                if not result and not self._load_error:
                    self._load_error = "模型加载失败，未知错误"
                return result
            finally:
                self._loading = False
    
    async def load_model(self, force_reload: bool = False) -> bool:
        if self.model_loaded and not force_reload:
            return True
        
        if self._loading:
            logger.warning("Model is already loading, waiting...")
            return False
        
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.load_model_sync)
    
    async def process_image(self, image_path: str) -> PaddleOCRResult:
        if not os.path.exists(image_path):
            return PaddleOCRResult(
                success=False,
                error=f"图片文件不存在: {image_path}"
            )
        
        if not self.model_loaded:
            success = await self.load_model()
            if not success:
                return PaddleOCRResult(
                    success=False,
                    error=f"模型加载失败: {self._load_error}"
                )
        
        try:
            loop = asyncio.get_event_loop()
            
            def do_ocr():
                return self.ocr.ocr(image_path, cls=True)
            
            ocr_result = await loop.run_in_executor(None, do_ocr)
            
            text_lines = []
            ocr_results = []
            
            if ocr_result and ocr_result[0]:
                for line in ocr_result[0]:
                    if line and len(line) >= 2:
                        box = line[0]
                        text_info = line[1]
                        if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                            text = text_info[0]
                            confidence = text_info[1]
                        else:
                            text = str(text_info)
                            confidence = 1.0
                        
                        text_lines.append(text)
                        ocr_results.append({
                            'text': text,
                            'confidence': float(confidence) if confidence else 1.0,
                            'box': box
                        })
            
            full_text = "\n".join(text_lines)
            code_blocks = self._extract_code_blocks(full_text)
            
            return PaddleOCRResult(
                success=True,
                text_content=full_text,
                code_blocks=code_blocks,
                ocr_results=ocr_results
            )
            
        except Exception as e:
            logger.error(f"Error processing image: {e}")
            import traceback
            traceback.print_exc()
            return PaddleOCRResult(
                success=False,
                error=str(e)
            )
    
    async def process_pdf(self, pdf_path: str, start_page: int = 0, end_page: int = None,
                          progress_callback: callable = None) -> PaddleOCRResult:
        if not os.path.exists(pdf_path):
            return PaddleOCRResult(
                success=False,
                error=f"PDF 文件不存在: {pdf_path}"
            )
        
        try:
            import fitz
            
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            actual_end = min(end_page, total_pages) if end_page else total_pages
            
            all_text = []
            all_code_blocks = []
            all_ocr_results = []
            pages_result = []
            
            for page_idx in range(start_page, actual_end):
                page = doc[page_idx]
                
                mat = fitz.Matrix(2.0, 2.0)
                pix = page.get_pixmap(matrix=mat)
                
                tmp_dir = tempfile.gettempdir()
                tmp_path = os.path.join(tmp_dir, f"paddle_ocr_{page_idx}_{os.getpid()}.png")
                
                try:
                    pix.save(tmp_path)
                except Exception as save_err:
                    logger.warning(f"Failed to save temp image: {save_err}")
                    tmp_path = os.path.join(tempfile.gettempdir(), f"temp_ocr_{page_idx}.png")
                    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
                    pix.save(tmp_path)
                
                try:
                    result = await self.process_image(tmp_path)
                    
                    if result.success:
                        all_text.append(result.text_content)
                        all_code_blocks.extend(result.code_blocks)
                        all_ocr_results.extend(result.ocr_results)
                        
                        pages_result.append({
                            'page_number': page_idx + 1,
                            'text_content': result.text_content,
                            'code_blocks': result.code_blocks,
                            'ocr_results': result.ocr_results
                        })
                    else:
                        logger.warning(f"Failed to process page {page_idx + 1}: {result.error}")
                        pages_result.append({
                            'page_number': page_idx + 1,
                            'error': result.error
                        })
                    
                    if progress_callback:
                        progress = int((page_idx - start_page + 1) / (actual_end - start_page) * 100)
                        await progress_callback(progress, page_idx + 1, actual_end)
                        
                finally:
                    try:
                        if os.path.exists(tmp_path):
                            os.unlink(tmp_path)
                    except PermissionError:
                        pass
                    except Exception:
                        pass
            
            doc.close()
            
            return PaddleOCRResult(
                success=True,
                text_content="\n\n".join(all_text),
                pages=pages_result,
                code_blocks=all_code_blocks,
                ocr_results=all_ocr_results
            )
            
        except Exception as e:
            logger.error(f"Error processing PDF: {e}")
            import traceback
            traceback.print_exc()
            return PaddleOCRResult(
                success=False,
                error=str(e)
            )
    
    def _extract_code_blocks(self, text_content: str) -> List[Dict]:
        import re
        
        code_blocks = []
        
        code_patterns = [
            (r'```(\w*)\n(.*?)```', 'markdown_block'),
            (r'`([^`\n]+)`', 'inline_code'),
        ]
        
        language_keywords = {
            'python': ['def ', 'import ', 'from ', 'class ', 'print(', 'return ', 'if __name__'],
            'javascript': ['function ', 'const ', 'let ', 'var ', '=>', 'console.log', 'async '],
            'java': ['public ', 'private ', 'class ', 'void ', 'static ', 'System.out'],
            'cpp': ['#include', 'int main', 'std::', 'cout', 'namespace'],
            'go': ['func ', 'package ', 'import "', 'fmt.', 'go func'],
            'rust': ['fn ', 'let mut', 'impl ', 'pub fn', '::'],
        }
        
        for pattern, block_type in code_patterns:
            for match in re.finditer(pattern, text_content, re.DOTALL):
                if block_type == 'markdown_block':
                    lang = match.group(1) or 'unknown'
                    code = match.group(2)
                else:
                    lang = 'unknown'
                    code = match.group(1)
                
                if code and len(code.strip()) > 10:
                    detected_lang = self._detect_language(code, language_keywords)
                    code_blocks.append({
                        'type': block_type,
                        'language': detected_lang or lang,
                        'content': code.strip()
                    })
        
        indent_pattern = r'(?:^|\n)((?:    |\t)[^\n]+(?:\n(?:    |\t)[^\n]+)*)'
        for match in re.finditer(indent_pattern, text_content):
            code = match.group(1)
            if len(code.strip()) > 30:
                detected_lang = self._detect_language(code, language_keywords)
                if detected_lang:
                    code_blocks.append({
                        'type': 'indented_block',
                        'language': detected_lang,
                        'content': code.strip()
                    })
        
        return code_blocks
    
    def _detect_language(self, code: str, keywords: Dict[str, List[str]]) -> Optional[str]:
        scores = {}
        for lang, kws in keywords.items():
            score = sum(1 for kw in kws if kw in code)
            if score > 0:
                scores[lang] = score
        
        if scores:
            return max(scores, key=scores.get)
        return None
    
    def get_status(self) -> Dict[str, Any]:
        return {
            'model_loaded': self.model_loaded,
            'loading': self._loading,
            'error': self._load_error,
            'device': self.device,
            'gpu_available': self._use_gpu
        }

paddleocr_service = PaddleOCRService()
