import os
import sys
import json
import logging
import tempfile
import threading
import shutil
import subprocess
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
import asyncio

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
    """
    PaddleOCR 服务类
    
    优化架构：
    - 单进程，只初始化1个OCR实例（避免多进程启动开销）
    - 线程池并发读取和预处理图片
    - GPU推理虽然是单张处理，但CPU预处理和GPU可以流水线并行
    - 结果按页码排序，保证顺序正确
    
    性能对比：
    - 多进程方案：启动30秒 + 推理
    - 本方案：启动1-2秒 + 推理（总时间更短）
    """
    
    def __init__(self):
        self.ocr = None
        self.model_loaded = False
        self._loading = False
        self._load_error = None
        self.device = None
        self._use_gpu = False
        self._lock = threading.Lock()
        
        self._thread_pool = ThreadPoolExecutor(max_workers=4)
        self._ocr_lock = threading.Lock()
        
        self._cancelled = False
    
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
    
    def _check_gpu_available(self) -> Tuple[bool, str]:
        print(f"[GPU检查] 开始检查 GPU 可用性...")
        
        try:
            import paddle
            print(f"[GPU检查] PaddlePaddle 版本: {paddle.__version__}")
            print(f"[GPU检查] 是否编译了 CUDA: {paddle.is_compiled_with_cuda()}")
            
            if paddle.is_compiled_with_cuda():
                gpu_count = paddle.device.cuda.device_count()
                print(f"[GPU检查] 检测到 {gpu_count} 个 GPU")
                
                if gpu_count > 0:
                    gpu_name = paddle.device.cuda.get_device_name(0)
                    print(f"[GPU检查] GPU 0 名称: {gpu_name}")
                    
                    try:
                        gpu_memory = paddle.device.cuda.get_device_properties(0).total_memory
                        print(f"[GPU检查] GPU 0 显存: {gpu_memory / 1024**3:.2f} GB")
                    except:
                        print(f"[GPU检查] 无法获取 GPU 显存信息")
                    
                    print(f"[GPU检查] ✅ GPU 可用: {gpu_name}")
                    logger.info(f"PaddlePaddle GPU available: {gpu_name}")
                    return True, "gpu"
            
            print(f"[GPU检查] ❌ GPU 不可用，将使用 CPU")
            logger.info("PaddlePaddle GPU not available, using CPU")
            return False, "cpu"
        except Exception as e:
            print(f"[GPU检查] ❌ GPU 检查出错: {e}")
            logger.warning(f"Error checking GPU: {e}")
            return False, "cpu"
    
    def _do_load_model(self) -> bool:
        import time
        start_time = time.time()
        
        print(f"\n{'='*80}")
        print(f"[PaddleOCR] 开始加载模型...")
        print(f"[PaddleOCR] 开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*80}")
        
        try:
            print(f"[PaddleOCR] 步骤1: 导入 PaddlePaddle...")
            import paddle
            
            print(f"[PaddleOCR] 步骤2: 检查 GPU 可用性...")
            self._use_gpu, self.device = self._check_gpu_available()
            print(f"[PaddleOCR] GPU 可用: {self._use_gpu}, 设备: {self.device}")
            
            if not self._use_gpu:
                error_msg = "GPU 不可用，请确保 CUDA 和 cuDNN 已正确安装。OCR 功能仅支持 GPU 模式。"
                print(f"[PaddleOCR] 错误: {error_msg}")
                raise Exception(error_msg)
            
            print(f"[PaddleOCR] 步骤3: 设置 GPU 设备...")
            paddle.device.set_device("gpu:0")
            print(f"[PaddleOCR] 已设置 paddle device to GPU:0")
            logger.info("Set paddle device to GPU:0")
            
            print(f"[PaddleOCR] 步骤4: 导入 PaddleOCR...")
            from paddleocr import PaddleOCR
            
            print(f"[PaddleOCR] 步骤5: 初始化 PaddleOCR 模型 (这可能需要10-30秒)...")
            print(f"[PaddleOCR] 参数: use_angle_cls=True, lang='ch', use_gpu=True")
            
            init_start = time.time()
            self.ocr = PaddleOCR(
                use_angle_cls=True,
                lang='ch',
                use_gpu=True,
                show_log=False
            )
            init_time = time.time() - init_start
            
            print(f"[PaddleOCR] PaddleOCR 初始化完成，耗时: {init_time:.2f} 秒")
            
            if self.ocr is None:
                error_msg = "PaddleOCR 初始化返回 None"
                print(f"[PaddleOCR] 错误: {error_msg}")
                raise Exception(error_msg)
            
            self.model_loaded = True
            total_time = time.time() - start_time
            
            print(f"\n{'='*80}")
            print(f"[PaddleOCR] ✅ 模型加载成功!")
            print(f"[PaddleOCR] 总耗时: {total_time:.2f} 秒")
            print(f"[PaddleOCR] 设备: GPU")
            print(f"{'='*80}\n")
            
            logger.info(f"PaddleOCR model loaded successfully on GPU in {total_time:.2f}s")
            return True
            
        except Exception as e:
            self._load_error = str(e) if str(e) else f"加载失败: {type(e).__name__}"
            total_time = time.time() - start_time
            
            print(f"\n{'='*80}")
            print(f"[PaddleOCR] ❌ 模型加载失败!")
            print(f"[PaddleOCR] 错误: {e}")
            print(f"[PaddleOCR] 耗时: {total_time:.2f} 秒")
            print(f"{'='*80}\n")
            
            logger.error(f"Failed to load PaddleOCR model: {e}")
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
    
    def _process_single_image_sync(self, image_path: str) -> Dict[str, Any]:
        """同步处理单张图片（在线程池中运行，加锁保护OCR调用）"""
        try:
            if not os.path.exists(image_path):
                return {'success': False, 'error': f'图片不存在: {image_path}'}
            
            with self._ocr_lock:
                result = self.ocr.ocr(image_path, cls=True)
            
            text_lines = []
            ocr_results = []
            
            if result and len(result) > 0 and result[0] is not None:
                for line in result[0]:
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
            
            return {
                'success': True,
                'text_content': full_text,
                'ocr_results': ocr_results
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def process_image(self, image_path: str) -> PaddleOCRResult:
        """
        处理单张图片
        
        接口保持不变
        """
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
            result = await loop.run_in_executor(
                self._thread_pool,
                self._process_single_image_sync,
                image_path
            )
            
            if result.get('success'):
                code_blocks = self._extract_code_blocks(result.get('text_content', ''))
                return PaddleOCRResult(
                    success=True,
                    text_content=result.get('text_content', ''),
                    code_blocks=code_blocks,
                    ocr_results=result.get('ocr_results', [])
                )
            else:
                return PaddleOCRResult(
                    success=False,
                    error=result.get('error', '未知错误')
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
        """
        处理PDF文件
        
        接口保持不变
        """
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
                    except:
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
        """
        创建可搜索的PDF
        
        接口保持不变
        """
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
                    
                    result = await self.process_image(tmp_path)
                    
                    logger.info(f"OCR result for page {page_idx + 1}: success={result.success}")
                    
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
                    except:
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
        """
        智能处理PDF
        
        接口保持不变
        """
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
        """
        从PDF提取文本 - 核心方法
        
        优化版本：单进程 + 线程池并发预处理
        - 启动时间：1-2秒（只初始化一次OCR）
        - 顺序保证：100%正确（按页码顺序处理）
        - 显存占用：最小（只有1份模型）
        
        Args:
            pdf_path: PDF文件路径
            start_page: 起始页码（0-based）
            end_page: 结束页码
            progress_callback: 进度回调
            status_callback: 状态回调
            concurrency: 预处理线程数（1-8）
        
        Returns:
            Dict with success, text_content, pages, etc.
        """
        print(f"\n[OCR PDF] ========== extract_text_from_pdf 开始 ==========")
        print(f"[OCR PDF] PDF 路径: {pdf_path}")
        print(f"[OCR PDF] start_page: {start_page}, end_page: {end_page}")
        print(f"[OCR PDF] 预处理线程数: {concurrency}")
        
        if not os.path.exists(pdf_path):
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
            
            if not self.model_loaded:
                success = await self.load_model()
                if not success:
                    return {
                        'success': False,
                        'error': f"模型加载失败: {self._load_error}"
                    }
            
            if concurrency > 1:
                self._thread_pool = ThreadPoolExecutor(max_workers=min(concurrency, 8))
            
            print(f"[OCR PDF] 模式: 单进程 + 线程池({concurrency}线程)")
            
            if status_callback:
                await status_callback('processing', 0, '开始处理 PDF...')
            
            self.reset_cancel()
            
            all_temp_files = []
            page_image_map = {}
            
            print(f"[OCR PDF] 正在提取PDF页面图片...")
            
            for page_idx in range(start_page, actual_end):
                if self.is_cancelled():
                    print(f"[OCR PDF] 用户取消了处理")
                    break
                
                page = doc[page_idx]
                mat = fitz.Matrix(2.0, 2.0)
                pix = page.get_pixmap(matrix=mat)
                
                import uuid
                tmp_dir = tempfile.gettempdir()
                tmp_path = os.path.join(tmp_dir, f"paddle_ocr_{uuid.uuid4().hex}_{page_idx}.png")
                pix.save(tmp_path)
                
                all_temp_files.append(tmp_path)
                page_image_map[page_idx] = tmp_path
            
            doc.close()
            
            total_pages_to_process = len(page_image_map)
            print(f"[OCR PDF] 共提取 {total_pages_to_process} 页图片")
            
            if status_callback:
                await status_callback('processing', 0, f'正在处理 {total_pages_to_process} 页...')
            
            loop = asyncio.get_event_loop()
            results_dict = {}
            completed_count = 0
            completed_lock = threading.Lock()
            
            async def process_page(page_idx: int, image_path: str):
                nonlocal completed_count
                
                if self.is_cancelled():
                    return page_idx, None
                
                result = await loop.run_in_executor(
                    self._thread_pool,
                    self._process_single_image_sync,
                    image_path
                )
                
                with completed_lock:
                    completed_count += 1
                    if progress_callback:
                        progress = int(completed_count / total_pages_to_process * 100)
                        await progress_callback(progress, completed_count, total_pages_to_process)
                
                return page_idx, result
            
            tasks = []
            for page_idx in sorted(page_image_map.keys()):
                tasks.append(process_page(page_idx, page_image_map[page_idx]))
            
            results = await asyncio.gather(*tasks)
            
            for page_idx, result in results:
                if result is not None:
                    results_dict[page_idx] = result
            
            print(f"\n[OCR PDF] ========== 处理完成 ==========")
            
            for tmp_path in all_temp_files:
                try:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
                except:
                    pass
            
            sorted_page_indices = sorted(results_dict.keys())
            results_list = []
            
            for idx in sorted_page_indices:
                result = results_dict[idx]
                if result.get('success'):
                    results_list.append({
                        'page_number': idx + 1,
                        'text': result.get('text_content', ''),
                        'success': True
                    })
                else:
                    results_list.append({
                        'page_number': idx + 1,
                        'text': '',
                        'error': result.get('error'),
                        'success': False
                    })
            
            all_text = [r['text'] for r in results_list if r.get('success') and r.get('text')]
            pages_text = [{'page_number': r['page_number'], 'text': r['text']} for r in results_list]
            
            full_text = "\n\n".join(all_text)
            
            print(f"[OCR PDF] 成功页面数: {len(all_text)}/{len(results_list)}")
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
                'message': 'OCR处理完成',
                'mode': 'single_process_thread_pool',
                'thread_count': concurrency
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
        """
        原地创建可搜索PDF
        
        接口保持不变
        """
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
        """获取服务状态"""
        return {
            'model_loaded': self.model_loaded,
            'loading': self._loading,
            'error': self._load_error,
            'device': self.device,
            'gpu_available': self._use_gpu,
            'mode': 'single_process_thread_pool'
        }
    
    def get_gpu_status(self) -> Tuple[float, float, float]:
        """获取GPU状态"""
        return (
            self._get_gpu_utilization(),
            *self._get_gpu_memory_info()
        )
    
    def cancel_processing(self):
        """取消处理"""
        self._cancelled = True
    
    def is_cancelled(self) -> bool:
        """检查是否已取消"""
        return getattr(self, '_cancelled', False)
    
    def reset_cancel(self):
        """重置取消状态"""
        self._cancelled = False
    
    def __del__(self):
        """析构函数 - 清理线程池"""
        try:
            self._thread_pool.shutdown(wait=False)
        except:
            pass


paddleocr_service = PaddleOCRService()
