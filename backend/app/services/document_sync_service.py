import json
import os
from typing import List, Dict, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import BookDocument, Document
from app.services.file_parser import FileParser
from app.services.duplicate_detector import duplicate_detector

CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "document_sources.json")


class SourceConfig:
    def __init__(self, data: dict):
        self.id = data.get("id", "")
        self.name = data.get("name", "")
        self.type = data.get("type", "document")
        self.path = data.get("path", "")
        self.enabled = data.get("enabled", True)
        self.file_extensions = data.get("file_extensions", [])
        self.auto_sync_on_startup = data.get("auto_sync_on_startup", True)


class SyncSettings:
    def __init__(self, data: dict):
        self.sync_on_startup = data.get("sync_on_startup", True)
        self.remove_orphans = data.get("remove_orphans", False)
        self.update_existing = data.get("update_existing", False)


class DocumentSourceConfig:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._config = None
        self._sources: List[SourceConfig] = []
        self._sync_settings: Optional[SyncSettings] = None
        self._load_config()
    
    def _load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    self._config = json.load(f)
                    self._sources = [
                        SourceConfig(s) for s in self._config.get("sources", [])
                    ]
                    self._sync_settings = SyncSettings(
                        self._config.get("sync_settings", {})
                    )
            except Exception as e:
                print(f"Failed to load document sources config: {e}")
                self._create_default_config()
        else:
            self._create_default_config()
    
    def _create_default_config(self):
        default_config = {
            "version": 1,
            "description": "文档源配置",
            "sources": [
                {
                    "id": "books_folder",
                    "name": "书籍文件夹",
                    "type": "book",
                    "path": "uploads/books",
                    "enabled": True,
                    "file_extensions": [".pdf"],
                    "auto_sync_on_startup": True
                },
                {
                    "id": "documents_folder",
                    "name": "文档文件夹",
                    "type": "document",
                    "path": "uploads/documents",
                    "enabled": True,
                    "file_extensions": [".md", ".txt", ".docx"],
                    "auto_sync_on_startup": True
                }
            ],
            "sync_settings": {
                "sync_on_startup": True,
                "remove_orphans": False,
                "update_existing": False
            }
        }
        self._config = default_config
        self._sources = [SourceConfig(s) for s in default_config["sources"]]
        self._sync_settings = SyncSettings(default_config["sync_settings"])
        
        try:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(default_config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Failed to create default config: {e}")
    
    def get_sources(self) -> List[SourceConfig]:
        return self._sources
    
    def get_enabled_sources(self) -> List[SourceConfig]:
        return [s for s in self._sources if s.enabled and s.path]
    
    def get_sync_settings(self) -> SyncSettings:
        return self._sync_settings or SyncSettings({})
    
    def update_source(self, source_id: str, updates: dict) -> bool:
        for i, source in enumerate(self._sources):
            if source.id == source_id:
                for key, value in updates.items():
                    if hasattr(source, key):
                        setattr(source, key, value)
                self._save_config()
                return True
        return False
    
    def add_source(self, source_data: dict) -> SourceConfig:
        source = SourceConfig(source_data)
        self._sources.append(source)
        self._save_config()
        return source
    
    def remove_source(self, source_id: str) -> bool:
        for i, source in enumerate(self._sources):
            if source.id == source_id:
                self._sources.pop(i)
                self._save_config()
                return True
        return False
    
    def _save_config(self):
        config = {
            "version": 1,
            "description": "文档源配置",
            "sources": [
                {
                    "id": s.id,
                    "name": s.name,
                    "type": s.type,
                    "path": s.path,
                    "enabled": s.enabled,
                    "file_extensions": s.file_extensions,
                    "auto_sync_on_startup": s.auto_sync_on_startup
                }
                for s in self._sources
            ],
            "sync_settings": {
                "sync_on_startup": self._sync_settings.sync_on_startup if self._sync_settings else True,
                "remove_orphans": self._sync_settings.remove_orphans if self._sync_settings else False,
                "update_existing": self._sync_settings.update_existing if self._sync_settings else False
            }
        }
        try:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Failed to save config: {e}")


class DocumentSyncService:
    def __init__(self, db: Session):
        self.db = db
        self.config = DocumentSourceConfig()
    
    def sync_all_sources(self) -> Dict:
        results = {
            "total_scanned": 0,
            "books_added": 0,
            "books_existing": 0,
            "documents_added": 0,
            "documents_existing": 0,
            "errors": [],
            "sources": []
        }
        
        sources = self.config.get_enabled_sources()
        
        for source in sources:
            source_result = self._sync_source(source)
            results["total_scanned"] += source_result["scanned"]
            results["books_added"] += source_result["books_added"]
            results["books_existing"] += source_result["books_existing"]
            results["documents_added"] += source_result["documents_added"]
            results["documents_existing"] += source_result["documents_existing"]
            results["errors"].extend(source_result["errors"])
            results["sources"].append({
                "id": source.id,
                "name": source.name,
                "type": source.type,
                "result": source_result
            })
        
        return results
    
    def _sync_source(self, source: SourceConfig) -> Dict:
        result = {
            "scanned": 0,
            "books_added": 0,
            "books_existing": 0,
            "documents_added": 0,
            "documents_existing": 0,
            "errors": []
        }
        
        base_dir = os.path.dirname(os.path.dirname(__file__))
        full_path = os.path.join(base_dir, source.path) if not os.path.isabs(source.path) else source.path
        
        if not os.path.exists(full_path):
            os.makedirs(full_path, exist_ok=True)
            return result
        
        for root, dirs, files in os.walk(full_path):
            for file in files:
                file_ext = os.path.splitext(file)[1].lower()
                if file_ext not in source.file_extensions:
                    continue
                
                result["scanned"] += 1
                file_path = os.path.join(root, file)
                
                try:
                    if source.type == "book":
                        self._sync_book(file_path, file, result)
                    else:
                        self._sync_document(file_path, file, file_ext, result)
                except Exception as e:
                    result["errors"].append(f"{file}: {str(e)}")
        
        return result
    
    def _sync_book(self, file_path: str, file_name: str, result: Dict):
        existing = self.db.query(BookDocument).filter(
            BookDocument.file_path == file_path
        ).first()
        
        if existing:
            result["books_existing"] += 1
            return
        
        title = os.path.splitext(file_name)[0]
        author = None
        
        import re
        patterns = [
            (r'^(.+?)\s*\((.+?)\)\s*\(Z-Library\)$', lambda m: (m.group(1).strip(), m.group(2).strip())),
            (r'^(.+?)\s*[-–]\s*(.+?)$', lambda m: (m.group(2).strip(), m.group(1).strip())),
        ]
        
        for pattern, extractor in patterns:
            match = re.match(pattern, title)
            if match:
                try:
                    title, author = extractor(match)
                    break
                except:
                    continue
        
        file_size = os.path.getsize(file_path)
        
        file_hash = None
        content_hash = None
        page_count = None
        duplicate_group_id = None
        is_primary = 1
        duplicate_status = 'unique'
        
        try:
            file_hash = duplicate_detector.calculate_file_hash(file_path)
            content_hash, _ = duplicate_detector.calculate_content_hash(file_path)
            page_count = duplicate_detector.get_page_count(file_path)
            
            existing_by_hash = self.db.query(BookDocument).filter(
                BookDocument.file_hash_sha256 == file_hash
            ).first()
            
            if existing_by_hash:
                duplicate_group_id = existing_by_hash.duplicate_group_id or str(__import__('uuid').uuid4())
                is_primary = 0
                duplicate_status = 'duplicate'
                
                if not existing_by_hash.duplicate_group_id:
                    existing_by_hash.duplicate_group_id = duplicate_group_id
                    existing_by_hash.duplicate_status = 'primary'
                    existing_by_hash.is_primary = 1
                
                result.setdefault("duplicates_found", 0)
                result["duplicates_found"] += 1
                print(f"Duplicate detected: {file_name} is duplicate of {existing_by_hash.title}")
        except Exception as e:
            print(f"Failed to calculate hash for {file_name}: {e}")
        
        cover_image = None
        thumbnail = None
        try:
            cover_image, thumbnail = self._generate_pdf_cover(file_path)
        except Exception as e:
            print(f"Failed to generate cover for {file_name}: {e}")
        
        book = BookDocument(
            title=title,
            author=author,
            file_path=file_path,
            file_size=file_size,
            cover_image=cover_image,
            thumbnail=thumbnail,
            file_hash_sha256=file_hash,
            content_hash_simhash=content_hash,
            page_count=page_count,
            duplicate_group_id=duplicate_group_id,
            is_primary=is_primary,
            duplicate_status=duplicate_status
        )
        self.db.add(book)
        self.db.commit()
        result["books_added"] += 1
    
    def _sync_document(self, file_path: str, file_name: str, file_ext: str, result: Dict):
        existing = self.db.query(Document).filter(
            Document.file_path == file_path
        ).first()
        
        if existing:
            result["documents_existing"] += 1
            return
        
        title = os.path.splitext(file_name)[0]
        content_text = ""
        
        if file_ext in ['.md', '.markdown', '.docx', '.txt']:
            try:
                content_text = FileParser.parse_file(file_path, file_ext)
            except Exception as e:
                print(f"Failed to parse {file_name}: {e}")
        
        doc_type = "pdf_ebook" if file_ext == '.pdf' else "text_document"
        
        document = Document(
            title=title,
            original_content=content_text,
            file_path=file_path,
            doc_type=doc_type
        )
        self.db.add(document)
        self.db.commit()
        result["documents_added"] += 1
    
    def _generate_pdf_cover(self, file_path: str) -> tuple:
        try:
            import fitz
            import io
            import base64
            from PIL import Image
            
            doc = fitz.open(file_path)
            if len(doc) == 0:
                return None, None
            
            page = doc[0]
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            max_height = 800
            if img.size[1] > max_height:
                ratio = max_height / img.size[1]
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=85, optimize=True)
            output.seek(0)
            cover_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
            cover_data_url = f"data:image/jpeg;base64,{cover_base64}"
            
            thumbnail_height = 200
            if img.size[1] > thumbnail_height:
                ratio = thumbnail_height / img.size[1]
                new_thumb_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                thumb_img = img.resize(new_thumb_size, Image.Resampling.LANCZOS)
            else:
                thumb_img = img
            
            output_thumb = io.BytesIO()
            thumb_img.save(output_thumb, format='JPEG', quality=60, optimize=True)
            output_thumb.seek(0)
            thumbnail_base64 = base64.b64encode(output_thumb.getvalue()).decode('utf-8')
            thumbnail_data_url = f"data:image/jpeg;base64,{thumbnail_base64}"
            
            return cover_data_url, thumbnail_data_url
            
        except Exception as e:
            print(f"Failed to generate cover: {e}")
            return None, None


document_source_config = DocumentSourceConfig()
