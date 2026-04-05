import os
import sys
import json
import logging
import tempfile
import asyncio
import threading
import shutil
import subprocess
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
        self._max_concurrent = 4
        self._ocr_semaphore = None
        self._ocr_lock = asyncio.Lock()
        
    def _get_gpu_utilization(self) -> float:
        try:
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
                capture_output=True, text=True, timeout=2
            )
            if result.returncode == 0:
                return float(result.stdout.strip().split('\n')[0])
        except:
            pass
        return 0.0
    
    def _get_gpu_memory_info(self) -> Tuple[float, float]:
        try:
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'],
                capture_output=True, text=True, timeout=2
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split(',')
                if len(parts) >= 2:
                    used = float(parts[0].strip())
                    total = float(parts[1].strip())
                    return used, total
        except:
            pass
        return 0, 8192
    
    def _calculate_optimal_concurrency(self) -> int:
        gpu_util = self._get_gpu_utilization()
        mem_used, mem_total = self._get_gpu_memory_info()
        mem_percent = (mem_used / mem_total) * 100 if mem_total > 0 else 0
        
        if gpu_util > 80 or mem_percent > 80:
            return 1
        elif gpu_util > 60 or mem_percent > 60:
            return 2
        elif gpu_util > 40 or mem_percent > 40:
            return 3
        else:
            return 4
        
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
        print(f"\n[OCR MODEL] ========== _do_load_model 开始 ==========")
        try:
            import paddle
            
            print(f"[OCR MODEL] paddle.is_compiled_with_cuda(): {paddle.is_compiled_with_cuda()}")
            print(f"[OCR MODEL] paddle.device.cuda.device_count(): {paddle.device.cuda.device_count()}")
            
            self._use_gpu, self.device = self._check_gpu_available()
            print(f"[OCR MODEL] GPU 检测结果: _use_gpu={self._use_gpu}, device={self.device}")
            
            if not self._use_gpu:
                print(f"[OCR MODEL] 错误: GPU 不可用")
                raise Exception("GPU 不可用，请确保 CUDA 和 cuDNN 已正确安装。OCR 功能仅支持 GPU 模式。")
            
            print(f"[OCR MODEL] 设置 paddle device 为 GPU:0")
            paddle.device.set_device("gpu:0")
            logger.info("Set paddle device to GPU:0")
            
            from paddleocr import PaddleOCR
            
            print(f"[OCR MODEL] 初始化 PaddleOCR (use_gpu=True)...")
            logger.info("Initializing PaddleOCR with GPU...")
            
            self.ocr = PaddleOCR(
                use_angle_cls=True,
                lang='ch',
                use_gpu=True,
                show_log=False
            )
            
            print(f"[OCR MODEL] PaddleOCR 初始化完成: {self.ocr is not None}")
            
            if self.ocr is None:
                print(f"[OCR MODEL] 错误: PaddleOCR 初始化返回 None")
                raise Exception("PaddleOCR 初始化返回 None")
            
            self.model_loaded = True
            print(f"[OCR MODEL] 模型加载成功, model_loaded={self.model_loaded}")
            logger.info(f"PaddleOCR model loaded successfully on GPU")
            return True
            
        except Exception as e:
            self._load_error = str(e) if str(e) else f"加载失败: {type(e).__name__}"
            logger.error(f"Failed to load PaddleOCR model: {e}")
            import traceback
            traceback.print_exc()
            print(f"[OCR DEBUG] Model load failed: {e}")
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
        print(f"\n[OCR IMAGE] ========== process_image 开始 ==========")
        print(f"[OCR IMAGE] 图片路径: {image_path}")
        print(f"[OCR IMAGE] 图片存在: {os.path.exists(image_path)}")
        print(f"[OCR IMAGE] model_loaded: {self.model_loaded}")
        print(f"[OCR IMAGE] _use_gpu: {self._use_gpu}")
        print(f"[OCR IMAGE] _loading: {self._loading}")
        print(f"[OCR IMAGE] _load_error: {self._load_error}")
        
        if not os.path.exists(image_path):
            print(f"[OCR IMAGE] 错误: 图片文件不存在")
            return PaddleOCRResult(
                success=False,
                error=f"图片文件不存在: {image_path}"
            )
        
        if not self.model_loaded:
            print(f"[OCR IMAGE] 模型未加载，开始加载...")
            success = await self.load_model()
            print(f"[OCR IMAGE] 模型加载结果: {success}")
            print(f"[OCR IMAGE] 加载后 model_loaded: {self.model_loaded}")
            print(f"[OCR IMAGE] 加载后 _load_error: {self._load_error}")
            if not success:
                print(f"[OCR IMAGE] 错误: 模型加载失败")
                return PaddleOCRResult(
                    success=False,
                    error=f"模型加载失败: {self._load_error}"
                )
        
        print(f"[OCR IMAGE] 开始 OCR 识别...")
        print(f"[OCR IMAGE] self.ocr 对象: {self.ocr is not None}")
        
        try:
            import time
            start_time = time.time()
            
            loop = asyncio.get_event_loop()
            
            def do_ocr():
                print(f"[OCR IMAGE] 调用 self.ocr.ocr()...")
                print(f"[OCR IMAGE] self.ocr 类型: {type(self.ocr)}")
                try:
                    result = self.ocr.ocr(image_path, cls=True)
                    print(f"[OCR IMAGE] OCR 调用完成")
                    print(f"[OCR IMAGE] 结果类型: {type(result)}")
                    print(f"[OCR IMAGE] 结果是否为None: {result is None}")
                    if result:
                        print(f"[OCR IMAGE] 结果长度: {len(result)}")
                        if len(result) > 0:
                            print(f"[OCR IMAGE] 第一个元素类型: {type(result[0])}")
                            print(f"[OCR IMAGE] 第一个元素是否为None: {result[0] is None}")
                            if result[0]:
                                print(f"[OCR IMAGE] 第一个元素长度: {len(result[0])}")
                    return result
                except Exception as e:
                    print(f"[OCR IMAGE] OCR 调用异常: {e}")
                    import traceback
                    traceback.print_exc()
                    raise
            
            ocr_result = await loop.run_in_executor(None, do_ocr)
            
            elapsed = time.time() - start_time
            print(f"[OCR IMAGE] OCR 耗时: {elapsed:.2f} 秒")
            
            text_lines = []
            ocr_results = []
            
            print(f"[OCR IMAGE] 检查 OCR 结果...")
            print(f"[OCR IMAGE] ocr_result 类型: {type(ocr_result)}")
            print(f"[OCR IMAGE] ocr_result 值: {ocr_result}")
            
            if ocr_result is None:
                print(f"[OCR IMAGE] OCR 结果为 None")
            elif len(ocr_result) == 0:
                print(f"[OCR IMAGE] OCR 结果为空列表")
            elif ocr_result[0] is None:
                print(f"[OCR IMAGE] OCR 结果第一个元素为 None - 可能是没有检测到文本")
            elif len(ocr_result[0]) == 0:
                print(f"[OCR IMAGE] OCR 结果第一个元素为空列表")
            else:
                print(f"[OCR IMAGE] OCR 检测到 {len(ocr_result[0])} 个文本块")
                for i, line in enumerate(ocr_result[0]):
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
                        if i < 3:
                            print(f"[OCR IMAGE] 文本块 {i}: {text[:50]}...")
            
            full_text = "\n".join(text_lines)
            print(f"[OCR IMAGE] 提取了 {len(text_lines)} 行文本，共 {len(full_text)} 字符")
            
            code_blocks = self._extract_code_blocks(full_text)
            
            print(f"[OCR IMAGE] ========== process_image 结束 ==========\n")
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
                
                mat = fitz.Matrix(1.0, 2.0)
                pix = page.get_pixmap(matrix=mat)
                
                tmp_dir = tempfile.gettempdir()
                import uuid
                tmp_path = os.path.join(tmp_dir, f"paddle_ocr_{uuid.uuid4().hex}_{page_idx}.png")
                
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
    
    async def create_searchable_pdf(
        self,
        pdf_path: str,
        output_path: str = None,
        start_page: int = 0,
        end_page: int = None,
        progress_callback: callable = None
    ) -> PaddleOCRResult:
        if not os.path.exists(pdf_path):
            return PaddleOCRResult(
                success=False,
                error=f"PDF 文件不存在: {pdf_path}"
            )
        
        if not self.model_loaded:
            success = await self.load_model()
            if not success:
                return PaddleOCRResult(
                    success=False,
                    error=f"模型加载失败: {self._load_error}"
                )
        
        try:
            import fitz
            
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            actual_end = min(end_page, total_pages) if end_page else total_pages
            
            if output_path is None:
                base, ext = os.path.splitext(pdf_path)
                output_path = f"{base}_searchable{ext}"
            
            new_doc = fitz.open()
            
            all_text = []
            all_code_blocks = []
            all_ocr_results = []
            pages_result = []
            
            for page_idx in range(start_page, actual_end):
                page = doc[page_idx]
                
                mat = fitz.Matrix(2.0, 2.0)
                pix = page.get_pixmap(matrix=mat)
                
                tmp_dir = tempfile.gettempdir()
                import uuid
                tmp_path = os.path.join(tmp_dir, f"paddle_ocr_{uuid.uuid4().hex}_{page_idx}.png")
                
                try:
                    pix.save(tmp_path)
                except Exception as save_err:
                    logger.warning(f"Failed to save temp image: {save_err}")
                    tmp_path = os.path.join(tempfile.gettempdir(), f"temp_ocr_{page_idx}.png")
                    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
                    pix.save(tmp_path)
                
                try:
                    result = await self.process_image(tmp_path)
                    
                    logger.info(f"OCR result for page {page_idx + 1}: success={result.success}, ocr_results={len(result.ocr_results) if result.ocr_results else 0}")
                    
                    if result.success:
                        new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
                        
                        new_page.insert_image(
                            page.rect,
                            filename=tmp_path
                        )
                        
                        text_instances = []
                        for ocr_item in result.ocr_results:
                            text = ocr_item.get('text', '')
                            box = ocr_item.get('box', [])
                            
                            if not text or not box or len(box) < 4:
                                continue
                            
                            try:
                                scale_x = page.rect.width / (pix.width / 2.0)
                                scale_y = page.rect.height / (pix.height / 2.0)
                                
                                x0 = min(point[0] for point in box) * scale_x
                                y0 = min(point[1] for point in box) * scale_y
                                x1 = max(point[0] for point in box) * scale_x
                                y1 = max(point[1] for point in box) * scale_y
                                
                                rect = fitz.Rect(x0, y0, x1, y1)
                                
                                fontsize = max(6, min(14, (y1 - y0) * 0.6))
                                
                                text_instances.append({
                                    'text': text,
                                    'rect': rect,
                                    'fontsize': fontsize
                                })
                            except Exception as e:
                                logger.warning(f"Failed to process text box: {e}")
                                continue
                        
                        logger.info(f"Page {page_idx + 1}: {len(text_instances)} text instances to insert")
                        
                        for ti in text_instances:
                            try:
                                point = fitz.Point(ti['rect'].x0, ti['rect'].y1 - 2)
                                new_page.insert_text(
                                    point,
                                    ti['text'],
                                    fontsize=ti['fontsize'],
                                    fontname="china-s",
                                    color=(0, 0, 0)
                                )
                            except Exception as e:
                                logger.warning(f"Failed to insert text: {e}")
                                continue
                        
                        logger.info(f"Page {page_idx + 1}: text insertion completed")
                        
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
                        new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
                        new_page.insert_image(page.rect, filename=tmp_path)
                        
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
            
            new_doc.save(output_path)
            new_doc.close()
            
            logger.info(f"Searchable PDF created: {output_path}")
            
            return PaddleOCRResult(
                success=True,
                text_content="\n\n".join(all_text),
                pages=pages_result,
                code_blocks=all_code_blocks,
                ocr_results=all_ocr_results
            )
            
        except Exception as e:
            logger.error(f"Error creating searchable PDF: {e}")
            import traceback
            traceback.print_exc()
            return PaddleOCRResult(
                success=False,
                error=str(e)
            )
    
    async def process_pdf_smart(
        self,
        pdf_path: str,
        output_path: str = None,
        start_page: int = 0,
        end_page: int = None,
        progress_callback: callable = None
    ) -> Dict[str, Any]:
        if not os.path.exists(pdf_path):
            return {
                'success': False,
                'error': f"PDF 文件不存在: {pdf_path}"
            }
        
        try:
            import fitz
            
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            
            text_pages = 0
            for page in doc:
                text = page.get_text()
                if text.strip():
                    text_pages += 1
            
            doc.close()
            
            has_text = text_pages > total_pages * 0.3
            
            if has_text:
                logger.info(f"PDF already has text layer, extracting text: {pdf_path}")
                
                doc = fitz.open(pdf_path)
                all_text = []
                pages_text = []
                
                for page_idx, page in enumerate(doc):
                    text = page.get_text()
                    if text.strip():
                        all_text.append(text.strip())
                        pages_text.append({
                            'page_number': page_idx + 1,
                            'text': text.strip()
                        })
                
                doc.close()
                
                full_text = "\n\n".join(all_text)
                
                base, ext = os.path.splitext(pdf_path)
                text_file_path = f"{base}_ocr_text.txt"
                
                with open(text_file_path, 'w', encoding='utf-8') as f:
                    f.write(full_text)
                
                logger.info(f"Extracted text from PDF text layer, saved to: {text_file_path}")
                
                return {
                    'success': True,
                    'output_path': pdf_path,
                    'had_ocr': True,
                    'pages_processed': total_pages,
                    'text_content': full_text,
                    'pages': pages_text,
                    'text_file_path': text_file_path,
                    'message': 'PDF已包含文字层，已提取文字内容'
                }
            
            logger.info(f"PDF needs OCR processing: {pdf_path}")
            result = await self.create_searchable_pdf(
                pdf_path,
                output_path=output_path,
                start_page=start_page,
                end_page=end_page,
                progress_callback=progress_callback
            )
            
            return {
                'success': result.success,
                'output_path': output_path if result.success else None,
                'error': result.error,
                'had_ocr': False,
                'pages_processed': len(result.pages) if result.success else 0,
                'text_content': result.text_content,
                'pages': result.pages,
                'message': 'OCR处理完成' if result.success else f'OCR处理失败: {result.error}'
            }
            
        except Exception as e:
            logger.error(f"Error in smart PDF processing: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }
    
    async def extract_text_from_pdf(
        self,
        pdf_path: str,
        start_page: int = 0,
        end_page: int = None,
        progress_callback: callable = None,
        status_callback: callable = None,
        concurrency: int = 1
    ) -> Dict[str, Any]:
        print(f"\n[OCR PDF] ========== extract_text_from_pdf 开始 ==========")
        print(f"[OCR PDF] PDF 路径: {pdf_path}")
        print(f"[OCR PDF] 文件存在: {os.path.exists(pdf_path)}")
        print(f"[OCR PDF] start_page: {start_page}, end_page: {end_page}")
        print(f"[OCR PDF] concurrency: {concurrency}")
        
        if concurrency < 1:
            concurrency = 1
        if concurrency > 5:
            concurrency = 5
        
        if not os.path.exists(pdf_path):
            print(f"[OCR PDF] 错误: PDF 文件不存在")
            return {
                'success': False,
                'error': f"PDF 文件不存在: {pdf_path}"
            }
        
        try:
            import fitz
            
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            actual_end = min(end_page, total_pages) if end_page else total_pages
            
            print(f"[OCR PDF] PDF 总页数: {total_pages}")
            print(f"[OCR PDF] 处理范围: {start_page} 到 {actual_end}")
            
            if status_callback:
                await status_callback('loading_model', 0, '正在加载 OCR 模型...')
            
            print(f"[OCR PDF] 当前模型状态: model_loaded={self.model_loaded}")
            if not self.model_loaded:
                print(f"[OCR PDF] 模型未加载，开始加载...")
                success = await self.load_model()
                print(f"[OCR PDF] 模型加载结果: {success}")
                print(f"[OCR PDF] 加载后状态: model_loaded={self.model_loaded}, error={self._load_error}")
                if not success:
                    print(f"[OCR PDF] 错误: 模型加载失败")
                    return {
                        'success': False,
                        'error': f"模型加载失败: {self._load_error}"
                    }
            
            print(f"[OCR PDF] 开始处理 {actual_end - start_page} 页，并发数: {concurrency}")
            if status_callback:
                await status_callback('processing', 0, '开始处理 PDF...')
            
            doc = fitz.open(pdf_path)
            
            self.reset_cancel()
            
            progress_file = f"{os.path.splitext(pdf_path)[0]}_ocr_progress.json"
            
            results_dict = {}
            total_pages_to_process = actual_end - start_page
            completed_count = 0
            completed_lock = asyncio.Lock()
            
            semaphore = asyncio.Semaphore(concurrency)
            
            async def process_page(page_idx: int):
                async with semaphore:
                    if self.is_cancelled():
                        return None
                    
                    print(f"\n[OCR PDF] ---------- 处理第 {page_idx + 1}/{actual_end} 页 ----------")
                    
                    page = doc[page_idx]
                    
                    mat = fitz.Matrix(2.0, 2.0)
                    pix = page.get_pixmap(matrix=mat)
                    
                    import uuid
                    tmp_dir = tempfile.gettempdir()
                    tmp_path = os.path.join(tmp_dir, f"paddle_ocr_{uuid.uuid4().hex}_{page_idx}.png")
                    
                    try:
                        pix.save(tmp_path)
                        print(f"[OCR PDF] 临时图片已保存: {tmp_path}")
                        
                        result = await self.process_image(tmp_path)
                        print(f"[OCR PDF] 第 {page_idx + 1} 页结果: success={result.success}, text_len={len(result.text_content or '')}")
                        
                        if result.success:
                            page_text = result.text_content or ""
                            print(f"[OCR PDF] 第 {page_idx + 1} 页成功，文本长度: {len(page_text)}")
                            return {
                                'page_number': page_idx + 1,
                                'text': page_text,
                                'success': True
                            }
                        else:
                            print(f"[OCR PDF] 第 {page_idx + 1} 页失败: {result.error}")
                            return {
                                'page_number': page_idx + 1,
                                'text': '',
                                'error': result.error,
                                'success': False
                            }
                    finally:
                        try:
                            if os.path.exists(tmp_path):
                                os.unlink(tmp_path)
                        except:
                            pass
            
            async def process_page_with_progress(page_idx: int):
                result = await process_page(page_idx)
                
                if result is not None:
                    results_dict[page_idx] = result
                
                async with completed_lock:
                    nonlocal completed_count
                    completed_count += 1
                    if progress_callback:
                        progress = int(completed_count / total_pages_to_process * 100)
                        await progress_callback(progress, completed_count, total_pages_to_process)
                
                return result
            
            tasks = []
            for page_idx in range(start_page, actual_end):
                if self.is_cancelled():
                    print(f"[OCR PDF] 用户取消了处理")
                    break
                tasks.append(process_page_with_progress(page_idx))
            
            if tasks:
                await asyncio.gather(*tasks)
            
            doc.close()
            
            print(f"\n[OCR PDF] ========== 处理完成 ==========")
            
            try:
                if os.path.exists(progress_file):
                    os.unlink(progress_file)
            except:
                pass
            
            sorted_page_indices = sorted(results_dict.keys())
            results = [results_dict[idx] for idx in sorted_page_indices]
            
            all_text = [r['text'] for r in results if r.get('success')]
            pages_text = [{'page_number': r['page_number'], 'text': r['text']} for r in results]
            
            full_text = "\n\n".join(all_text)
            
            print(f"[OCR PDF] 成功页面数: {len(all_text)}/{len(results)}")
            print(f"[OCR PDF] 总文本长度: {len(full_text)} 字符")
            
            base, ext = os.path.splitext(pdf_path)
            text_file_path = f"{base}_ocr_text.txt"
            
            with open(text_file_path, 'w', encoding='utf-8') as f:
                f.write(full_text)
            
            print(f"[OCR PDF] 文本已保存到: {text_file_path}")
            logger.info(f"OCR text saved to: {text_file_path}")
            
            return {
                'success': True,
                'had_text': False,
                'pages_processed': len(pages_text),
                'text_content': full_text,
                'pages': pages_text,
                'text_file_path': text_file_path,
                'message': 'OCR处理完成'
            }
            
        except Exception as e:
            logger.error(f"Error in extract_text_from_pdf: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

    async def create_searchable_pdf_in_place(
        self,
        pdf_path: str,
        start_page: int = 0,
        end_page: int = None,
        progress_callback: callable = None,
        status_callback: callable = None
    ) -> Dict[str, Any]:
        if not os.path.exists(pdf_path):
            return {
                'success': False,
                'error': f"PDF 文件不存在: {pdf_path}"
            }
        
        try:
            import fitz
            
            doc = fitz.open(pdf_path)
            total_pages = len(doc)
            
            text_pages = 0
            for page in doc:
                text = page.get_text()
                if text.strip():
                    text_pages += 1
            
            doc.close()
            
            has_text = text_pages > total_pages * 0.3
            
            if has_text:
                logger.info(f"PDF already has text layer, extracting text: {pdf_path}")
                
                doc = fitz.open(pdf_path)
                all_text = []
                pages_text = []
                
                for page_idx, page in enumerate(doc):
                    text = page.get_text()
                    if text.strip():
                        all_text.append(text.strip())
                        pages_text.append({
                            'page_number': page_idx + 1,
                            'text': text.strip()
                        })
                
                doc.close()
                
                full_text = "\n\n".join(all_text)
                
                base, ext = os.path.splitext(pdf_path)
                text_file_path = f"{base}_ocr_text.txt"
                
                with open(text_file_path, 'w', encoding='utf-8') as f:
                    f.write(full_text)
                
                logger.info(f"Extracted text from PDF text layer, saved to: {text_file_path}")
                
                return {
                    'success': True,
                    'output_path': pdf_path,
                    'had_ocr': True,
                    'pages_processed': total_pages,
                    'text_content': full_text,
                    'pages': pages_text,
                    'text_file_path': text_file_path,
                    'message': 'PDF已包含文字层，已提取文字内容'
                }
            
            if status_callback:
                await status_callback('loading_model', 0, '正在加载 OCR 模型...')
            
            if not self.model_loaded:
                success = await self.load_model()
                if not success:
                    return {
                        'success': False,
                        'error': f"模型加载失败: {self._load_error}"
                    }
            
            if status_callback:
                await status_callback('processing', 0, '开始处理 PDF...')
            
            base, ext = os.path.splitext(pdf_path)
            temp_output = f"{base}_ocr_temp_{os.getpid()}{ext}"
            
            result = await self.create_searchable_pdf(
                pdf_path,
                output_path=temp_output,
                start_page=start_page,
                end_page=end_page,
                progress_callback=progress_callback
            )
            
            if result.success:
                backup_path = f"{base}_original_backup{ext}"
                shutil.copy2(pdf_path, backup_path)
                logger.info(f"Created backup: {backup_path}")
                
                shutil.move(temp_output, pdf_path)
                logger.info(f"Replaced original PDF with OCR version: {pdf_path}")
                
                try:
                    os.remove(backup_path)
                    logger.info(f"Removed backup: {backup_path}")
                except Exception as e:
                    logger.warning(f"Could not remove backup: {e}")
                
                return {
                    'success': True,
                    'output_path': pdf_path,
                    'had_ocr': False,
                    'pages_processed': len(result.pages),
                    'text_content': result.text_content,
                    'pages': result.pages,
                    'message': 'OCR处理完成，PDF已更新为可复制文字版本'
                }
            else:
                if os.path.exists(temp_output):
                    try:
                        os.remove(temp_output)
                    except:
                        pass
                
                return {
                    'success': False,
                    'error': result.error,
                    'pages_processed': 0,
                    'message': f'OCR处理失败: {result.error}'
                }
            
        except Exception as e:
            logger.error(f"Error in create_searchable_pdf_in_place: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_status(self) -> Dict[str, Any]:
        return {
            'model_loaded': self.model_loaded,
            'loading': self._loading,
            'error': self._load_error,
            'device': self.device,
            'gpu_available': self._use_gpu
        }
    
    def get_gpu_status(self) -> Tuple[float, float, float]:
        return (
            self._get_gpu_utilization(),
            *self._get_gpu_memory_info()
        )
    
    def cancel_processing(self):
        self._cancelled = True
    
    def is_cancelled(self) -> bool:
        return getattr(self, '_cancelled', False)
    
    def reset_cancel(self):
        self._cancelled = False

paddleocr_service = PaddleOCRService()
