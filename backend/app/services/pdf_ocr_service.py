import os
import sys
import json
import tempfile
import asyncio
import subprocess
import shutil
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

from app.services.code_block_detector import code_block_detector

logger = logging.getLogger(__name__)

TESSDATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "tessdata")

class PDFOCRResult:
    def __init__(self, success: bool, output_path: str = None, error: str = None, 
                 pages_processed: int = 0, had_ocr: bool = False):
        self.success = success
        self.output_path = output_path
        self.error = error
        self.pages_processed = pages_processed
        self.had_ocr = had_ocr
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'success': self.success,
            'output_path': self.output_path,
            'error': self.error,
            'pages_processed': self.pages_processed,
            'had_ocr': self.had_ocr
        }

class PDFOCRService:
    def __init__(self):
        self.tesseract_path = self._find_tesseract()
        self.tessdata_path = TESSDATA_PATH if os.path.exists(TESSDATA_PATH) else None
        self.ocrmypdf_available = self._check_ocrmypdf()
        
    def _find_tesseract(self) -> Optional[str]:
        possible_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            "/usr/bin/tesseract",
            "/usr/local/bin/tesseract",
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"Found Tesseract at: {path}")
                return path
        
        tesseract = shutil.which("tesseract")
        if tesseract:
            return tesseract
            
        logger.warning("Tesseract not found")
        return None
    
    def _check_ocrmypdf(self) -> bool:
        try:
            import ocrmypdf
            logger.info(f"OCRmyPDF module available: {ocrmypdf.__version__}")
            return True
        except ImportError:
            pass
        
        try:
            result = subprocess.run(
                [sys.executable, "-m", "ocrmypdf", "--version"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                logger.info(f"OCRmyPDF available via subprocess: {result.stdout.strip()}")
                return True
        except Exception as e:
            logger.warning(f"OCRmyPDF subprocess check failed: {e}")
        
        ocrmypdf_exe = shutil.which("ocrmypdf")
        if ocrmypdf_exe:
            logger.info(f"OCRmyPDF executable found: {ocrmypdf_exe}")
            return True
        
        logger.warning("OCRmyPDF not available")
        return False
    
    def _get_tessdata_prefix(self) -> Optional[str]:
        if self.tessdata_path and os.path.exists(self.tessdata_path):
            return os.path.dirname(self.tessdata_path)
        
        tesseract_dir = os.path.dirname(self.tesseract_path) if self.tesseract_path else None
        if tesseract_dir:
            tessdata_dir = os.path.join(tesseract_dir, "tessdata")
            if os.path.exists(tessdata_dir):
                return tesseract_dir
        
        return None
    
    async def check_pdf_has_text(self, file_path: str) -> Tuple[bool, int]:
        if not os.path.exists(file_path):
            return False, 0
        
        try:
            import fitz
            doc = fitz.open(file_path)
            total_pages = len(doc)
            text_pages = 0
            
            for page in doc:
                text = page.get_text()
                if text.strip():
                    text_pages += 1
            
            doc.close()
            
            has_text = text_pages > total_pages * 0.3
            return has_text, total_pages
            
        except Exception as e:
            logger.error(f"Error checking PDF text: {e}")
            return False, 0
    
    async def process_pdf_with_ocrmypdf(
        self, 
        file_path: str, 
        language: str = "chi_sim+eng",
        deskew: bool = True,
        clean: bool = False,
        force_ocr: bool = False,
        output_path: str = None
    ) -> PDFOCRResult:
        if not self.ocrmypdf_available:
            return PDFOCRResult(
                success=False,
                error="OCRmyPDF 不可用，请确保已正确安装"
            )
        
        if not os.path.exists(file_path):
            return PDFOCRResult(
                success=False,
                error=f"PDF 文件不存在: {file_path}"
            )
        
        has_text, total_pages = await self.check_pdf_has_text(file_path)
        
        if has_text and not force_ocr:
            logger.info(f"PDF already has text layer, skipping OCR: {file_path}")
            return PDFOCRResult(
                success=True,
                output_path=file_path,
                pages_processed=total_pages,
                had_ocr=True
            )
        
        if output_path is None:
            base, ext = os.path.splitext(file_path)
            output_path = f"{base}_ocr{ext}"
        
        cmd = [
            sys.executable, "-m", "ocrmypdf",
            "-l", language,
            "--jobs", "4",
            "--skip-text",
        ]
        
        if deskew:
            cmd.append("--deskew")
        
        if clean:
            cmd.extend(["--clean", "--clean-final"])
        
        tessdata_prefix = self._get_tessdata_prefix()
        if tessdata_prefix:
            cmd.extend(["--tessconfig-dir", tessdata_prefix])
        
        cmd.extend([file_path, output_path])
        
        logger.info(f"Running OCRmyPDF: {' '.join(cmd)}")
        
        try:
            env = os.environ.copy()
            if tessdata_prefix:
                env["TESSDATA_PREFIX"] = os.path.join(tessdata_prefix, "tessdata")
            
            def run_ocr():
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    env=env,
                    timeout=3600
                )
                return result
            
            result = await asyncio.get_event_loop().run_in_executor(None, run_ocr)
            
            if result.returncode == 0:
                logger.info(f"OCR completed successfully: {output_path}")
                return PDFOCRResult(
                    success=True,
                    output_path=output_path,
                    pages_processed=total_pages,
                    had_ocr=False
                )
            else:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"OCRmyPDF failed: {error_msg}")
                return PDFOCRResult(
                    success=False,
                    error=f"OCR 处理失败: {error_msg}"
                )
                
        except subprocess.TimeoutExpired:
            return PDFOCRResult(
                success=False,
                error="OCR 处理超时（超过1小时）"
            )
        except Exception as e:
            logger.error(f"OCR processing error: {e}")
            return PDFOCRResult(
                success=False,
                error=f"OCR 处理异常: {str(e)}"
            )
    
    async def process_pdf_in_place(
        self, 
        file_path: str, 
        language: str = "chi_sim+eng",
        deskew: bool = True,
        backup: bool = True
    ) -> PDFOCRResult:
        if not os.path.exists(file_path):
            return PDFOCRResult(
                success=False,
                error=f"PDF 文件不存在: {file_path}"
            )
        
        backup_path = None
        if backup:
            base, ext = os.path.splitext(file_path)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"{base}_backup_{timestamp}{ext}"
            shutil.copy2(file_path, backup_path)
            logger.info(f"Created backup: {backup_path}")
        
        result = await self.process_pdf_with_ocrmypdf(
            file_path,
            language=language,
            deskew=deskew,
            output_path=file_path
        )
        
        if not result.success and backup_path and os.path.exists(backup_path):
            shutil.move(backup_path, file_path)
            logger.info(f"Restored from backup due to failure")
        
        return result
    
    def get_available_languages(self) -> List[str]:
        languages = []
        
        if self.tessdata_path and os.path.exists(self.tessdata_path):
            for file in os.listdir(self.tessdata_path):
                if file.endswith(".traineddata"):
                    lang = file.replace(".traineddata", "")
                    languages.append(lang)
        
        tesseract_dir = os.path.dirname(self.tesseract_path) if self.tesseract_path else None
        if tesseract_dir:
            tessdata_dir = os.path.join(tesseract_dir, "tessdata")
            if os.path.exists(tessdata_dir):
                for file in os.listdir(tessdata_dir):
                    if file.endswith(".traineddata"):
                        lang = file.replace(".traineddata", "")
                        if lang not in languages:
                            languages.append(lang)
        
        return sorted(languages)
    
    def get_language_display_name(self, lang_code: str) -> str:
        lang_names = {
            'chi_sim': '简体中文',
            'chi_tra': '繁体中文',
            'eng': '英文',
            'jpn': '日文',
            'kor': '韩文',
            'fra': '法文',
            'deu': '德文',
            'spa': '西班牙文',
            'rus': '俄文',
            'ara': '阿拉伯文',
        }
        return lang_names.get(lang_code, lang_code)
    
    async def extract_text_with_code_detection(self, file_path: str) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            return {'success': False, 'error': f'PDF 文件不存在: {file_path}'}
        
        try:
            import fitz
            doc = fitz.open(file_path)
            results = []
            
            for page_idx, page in enumerate(doc):
                text_dict = page.get_text("dict")
                page_width = page.rect.width
                page_height = page.rect.height
                
                text_content = ""
                blocks = []
                
                for block in text_dict.get("blocks", []):
                    if block.get("type") == 0:
                        block_text = ""
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                block_text += span.get("text", "")
                            block_text += "\n"
                        
                        if block_text.strip():
                            text_content += block_text + "\n"
                            blocks.append({
                                'text': block_text.strip(),
                                'bbox': block.get('bbox', [0, 0, 0, 0])
                            })
                
                code_blocks = code_block_detector.detect_code_blocks(text_content)
                
                results.append({
                    'page_number': page_idx + 1,
                    'width': page_width,
                    'height': page_height,
                    'text': text_content,
                    'blocks': blocks,
                    'code_blocks': code_blocks,
                    'has_code': len(code_blocks) > 0
                })
            
            doc.close()
            
            return {
                'success': True,
                'total_pages': len(results),
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error extracting text with code detection: {e}")
            return {'success': False, 'error': str(e)}

pdf_ocr_service = PDFOCRService()
