from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db, SessionLocal
from app.routers.documents import router as documents_router
from app.routers.folders import router as folders_router
from app.routers.settings import router as settings_router
from app.routers.library import router as library_router
from app.routers.ocr import router as ocr_router
from app.routers.world_timeline import router as world_timeline_router
from app.routers.quark import router as quark_router
from app.routers.duplicates import router as duplicates_router
from app.routers.pdf_ocr import router as pdf_ocr_router
from app.routers.backup import router as backup_router
from app.routers.dashboard import router as dashboard_router
from app.routers.quick_notes import router as quick_notes_router
from app.routers.tasks import router as tasks_router
from app.routers.activity import router as activity_router
from app.services.document_sync_service import document_source_config, DocumentSyncService
from app.services.backup_service import backup_service
import os
import asyncio
import threading
import logging

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Interactive Document System",
    description="交互式文档增强系统API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_dir = "uploads/books"
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(documents_router, prefix="/api", tags=["documents"])
app.include_router(folders_router, prefix="/api", tags=["folders"])
app.include_router(settings_router, prefix="/api", tags=["settings"])
app.include_router(library_router, prefix="/api/library", tags=["library"])
app.include_router(ocr_router, prefix="/api/library/ocr", tags=["ocr"])
app.include_router(world_timeline_router, prefix="/api", tags=["world-timeline"])
app.include_router(quark_router, prefix="/api/quark", tags=["quark"])
app.include_router(duplicates_router, prefix="/api/duplicates", tags=["duplicates"])
app.include_router(pdf_ocr_router, prefix="/api/pdf-ocr", tags=["pdf-ocr"])
app.include_router(backup_router, prefix="/api/backup", tags=["backup"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(quick_notes_router, prefix="/api", tags=["quick-notes"])
app.include_router(tasks_router, prefix="/api/tasks", tags=["tasks"])
app.include_router(activity_router, prefix="/api/activity", tags=["activity"])


def preload_paddleocr():
    try:
        print("Preloading PaddleOCR model...")
        from app.services.paddleocr_service import paddleocr_service
        paddleocr_service.load_model_sync()
        print("PaddleOCR model preloaded successfully")
    except Exception as e:
        print(f"Failed to preload PaddleOCR model: {e}")


@app.on_event("startup")
async def startup_event():
    init_db()
    
    print("=" * 50)
    print("Checking data integrity...")
    integrity = backup_service.check_data_integrity()
    
    if not integrity["healthy"]:
        print("WARNING: Data integrity issues detected!")
        for warning in integrity["warnings"]:
            print(f"  - {warning}")
        for rec in integrity["recommendations"]:
            print(f"  -> {rec}")
        print("Consider using /api/backup/emergency-recovery to restore data")
    else:
        print("Data integrity check passed")
        print(f"  Documents: {integrity['current_stats'].get('documents', 0)}")
        print(f"  Books: {integrity['current_stats'].get('book_documents', 0)}")
        print(f"  Timeline events: {integrity['current_stats'].get('document_timeline_events', 0)}")
    
    print("Creating startup backup...")
    backup_result = backup_service.create_backup("startup")
    if backup_result["success"]:
        print(f"Startup backup created: {backup_result['backup_path']}")
    else:
        print(f"Failed to create startup backup: {backup_result.get('error')}")
    
    backup_service.start_scheduled_backups(interval_hours=6)
    print("Scheduled backups enabled (every 6 hours)")
    print("=" * 50)
    
    preload_thread = threading.Thread(target=preload_paddleocr, daemon=True)
    preload_thread.start()
    
    sync_settings = document_source_config.get_sync_settings()
    if sync_settings.sync_on_startup:
        print("Auto-syncing document sources on startup...")
        db = SessionLocal()
        try:
            sync_service = DocumentSyncService(db)
            result = sync_service.sync_all_sources()
            print(f"Sync complete: {result['books_added']} books added, {result['documents_added']} documents added")
        except Exception as e:
            print(f"Auto-sync failed: {e}")
        finally:
            db.close()


@app.get("/")
async def root():
    return {"message": "Interactive Document System API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/document-sources")
async def get_document_sources():
    sources = document_source_config.get_sources()
    return {
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
            for s in sources
        ],
        "sync_settings": {
            "sync_on_startup": document_source_config.get_sync_settings().sync_on_startup,
            "remove_orphans": document_source_config.get_sync_settings().remove_orphans,
            "update_existing": document_source_config.get_sync_settings().update_existing
        }
    }


@app.post("/api/document-sources/sync")
async def sync_document_sources():
    from app.database import get_db
    db = next(get_db())
    try:
        sync_service = DocumentSyncService(db)
        result = sync_service.sync_all_sources()
        return result
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/document-sources/{source_id}")
async def update_document_source(source_id: str, updates: dict):
    success = document_source_config.update_source(source_id, updates)
    if success:
        return {"success": True, "message": "Source updated"}
    return {"success": False, "message": "Source not found"}


@app.post("/api/document-sources")
async def add_document_source(source_data: dict):
    source = document_source_config.add_source(source_data)
    return {
        "success": True,
        "source": {
            "id": source.id,
            "name": source.name,
            "type": source.type,
            "path": source.path,
            "enabled": source.enabled
        }
    }


@app.delete("/api/document-sources/{source_id}")
async def remove_document_source(source_id: str):
    success = document_source_config.remove_source(source_id)
    if success:
        return {"success": True, "message": "Source removed"}
    return {"success": False, "message": "Source not found"}
