from fastapi import APIRouter

from app.database import get_db
from app.services.document_sync_service import DocumentSyncService, document_source_config

router = APIRouter()


@router.get("/document-sources")
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
                "auto_sync_on_startup": s.auto_sync_on_startup,
            }
            for s in sources
        ],
        "sync_settings": {
            "sync_on_startup": document_source_config.get_sync_settings().sync_on_startup,
            "remove_orphans": document_source_config.get_sync_settings().remove_orphans,
            "update_existing": document_source_config.get_sync_settings().update_existing,
        },
    }


@router.post("/document-sources/sync")
async def sync_document_sources():
    db = next(get_db())
    try:
        sync_service = DocumentSyncService(db)
        result = sync_service.sync_all_sources()
        return result
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@router.put("/document-sources/{source_id}")
async def update_document_source(source_id: str, updates: dict):
    success = document_source_config.update_source(source_id, updates)
    if success:
        return {"success": True, "message": "Source updated"}
    return {"success": False, "message": "Source not found"}


@router.post("/document-sources")
async def add_document_source(source_data: dict):
    source = document_source_config.add_source(source_data)
    return {
        "success": True,
        "source": {
            "id": source.id,
            "name": source.name,
            "type": source.type,
            "path": source.path,
            "enabled": source.enabled,
        },
    }


@router.delete("/document-sources/{source_id}")
async def remove_document_source(source_id: str):
    success = document_source_config.remove_source(source_id)
    if success:
        return {"success": True, "message": "Source removed"}
    return {"success": False, "message": "Source not found"}
