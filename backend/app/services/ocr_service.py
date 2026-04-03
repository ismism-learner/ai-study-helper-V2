import os
import json
import tempfile
import asyncio
from typing import List, Dict, Any, Optional
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class OCRTextBlock:
    def __init__(self, text: str, bbox: Dict[str, float], font_size: float = 12, confidence: float = 1.0):
        self.text = text
        self.bbox = bbox
        self.font_size = font_size
        self.confidence = confidence
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'text': self.text,
            'bbox': self.bbox,
            'font_size': self.font_size,
            'confidence': self.confidence
        }

class OCRPageResult:
    def __init__(self, page_number: int, width: float, height: float, blocks: List[OCRTextBlock]):
        self.page_number = page_number
        self.width = width
        self.height = height
        self.blocks = blocks
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'page_number': self.page_number,
            'width': self.width,
            'height': self.height,
            'blocks': [b.to_dict() for b in self.blocks]
        }

class OCRService:
    def __init__(self):
        self.use_mineru = self._check_mineru_available()
        self.use_pymupdf = self._check_pymupdf_available()
        
    def _check_mineru_available(self) -> bool:
        try:
            import magic_pdf
            return True
        except ImportError:
            logger.info("MinerU not available, falling back to PyMuPDF")
            return False
    
    def _check_pymupdf_available(self) -> bool:
        try:
            import fitz
            return True
        except ImportError:
            logger.warning("PyMuPDF not available, OCR functionality will be limited")
            return False
    
    async def process_pdf(self, file_path: str, start_page: int = 0, end_page: Optional[int] = None) -> List[OCRPageResult]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF file not found: {file_path}")
        
        if self.use_mineru:
            return await self._process_with_mineru(file_path, start_page, end_page)
        elif self.use_pymupdf:
            return await self._process_with_pymupdf(file_path, start_page, end_page)
        else:
            raise RuntimeError("No OCR backend available. Please install MinerU or PyMuPDF")
    
    async def _process_with_mineru(self, file_path: str, start_page: int, end_page: Optional[int]) -> List[OCRPageResult]:
        from magic_pdf.data.data_reader_writer import FileBasedDataReader, FileBasedDataWriter
        from magic_pdf.data.dataset import PymuDocDataset
        from magic_pdf.model.doc_analyze_by_custom_model import doc_analyze
        
        results = []
        
        def process_sync():
            reader = FileBasedDataReader("")
            pdf_bytes = reader.read(file_path)
            ds = PymuDocDataset(pdf_bytes)
            
            if ds.classify() == "ocr":
                infer_result = ds.apply_ocr()
            else:
                infer_result = ds.apply()
            
            page_count = len(ds)
            actual_end = end_page if end_page else page_count
            
            for page_idx in range(start_page, min(actual_end, page_count)):
                page_info = infer_result.get_page_info(page_idx)
                blocks = []
                
                if page_info and 'blocks' in page_info:
                    for block in page_info['blocks']:
                        if block.get('type') == 'text':
                            bbox = block.get('bbox', [0, 0, 0, 0])
                            text = block.get('text', '')
                            
                            if len(bbox) >= 4 and text.strip():
                                page_width = page_info.get('width', 612)
                                page_height = page_info.get('height', 792)
                                
                                ocr_block = OCRTextBlock(
                                    text=text,
                                    bbox={
                                        'x': bbox[0] / page_width,
                                        'y': bbox[1] / page_height,
                                        'width': (bbox[2] - bbox[0]) / page_width,
                                        'height': (bbox[3] - bbox[1]) / page_height
                                    },
                                    font_size=self._estimate_font_size(bbox, text),
                                    confidence=block.get('confidence', 1.0)
                                )
                                blocks.append(ocr_block)
                
                results.append(OCRPageResult(
                    page_number=page_idx + 1,
                    width=page_info.get('width', 612) if page_info else 612,
                    height=page_info.get('height', 792) if page_info else 792,
                    blocks=blocks
                ))
            
            return results
        
        return await asyncio.get_event_loop().run_in_executor(None, process_sync)
    
    async def _process_with_pymupdf(self, file_path: str, start_page: int, end_page: Optional[int]) -> List[OCRPageResult]:
        import fitz
        
        results = []
        
        def process_sync():
            nonlocal results
            doc = fitz.open(file_path)
            page_count = len(doc)
            actual_end = end_page if end_page else page_count
            
            for page_idx in range(start_page, min(actual_end, page_count)):
                page = doc[page_idx]
                blocks = []
                
                text_dict = page.get_text("dict")
                page_width = page.rect.width
                page_height = page.rect.height
                
                for block in text_dict.get("blocks", []):
                    if block.get("type") == 0:
                        for line in block.get("lines", []):
                            line_text = ""
                            font_size = 12
                            
                            for span in line.get("spans", []):
                                line_text += span.get("text", "")
                                font_size = max(font_size, span.get("size", 12))
                            
                            if line_text.strip():
                                bbox = line.get("bbox", [0, 0, 0, 0])
                                
                                ocr_block = OCRTextBlock(
                                    text=line_text,
                                    bbox={
                                        'x': bbox[0] / page_width,
                                        'y': bbox[1] / page_height,
                                        'width': (bbox[2] - bbox[0]) / page_width,
                                        'height': (bbox[3] - bbox[1]) / page_height
                                    },
                                    font_size=font_size,
                                    confidence=1.0
                                )
                                blocks.append(ocr_block)
                
                results.append(OCRPageResult(
                    page_number=page_idx + 1,
                    width=page_width,
                    height=page_height,
                    blocks=blocks
                ))
            
            doc.close()
            return results
        
        return await asyncio.get_event_loop().run_in_executor(None, process_sync)
    
    def _estimate_font_size(self, bbox: List[float], text: str) -> float:
        if len(bbox) < 4 or not text:
            return 12
        
        height = bbox[3] - bbox[1]
        width = bbox[2] - bbox[0]
        
        char_count = len(text)
        if char_count == 0:
            return 12
        
        estimated_height = height
        estimated_width_per_char = width / char_count
        
        return max(min(estimated_height, estimated_width_per_char * 1.5), 8)
    
    async def process_page(self, file_path: str, page_number: int) -> OCRPageResult:
        results = await self.process_pdf(file_path, start_page=page_number - 1, end_page=page_number)
        if results:
            return results[0]
        raise ValueError(f"Page {page_number} not found in PDF")

ocr_service = OCRService()
