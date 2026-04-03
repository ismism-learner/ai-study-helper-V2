from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os

from app.services.backup_service import backup_service

router = APIRouter()


class BackupInfo(BaseModel):
    name: str
    path: Optional[str] = None
    reason: str
    timestamp: str
    stats: Dict[str, int]


class BackupResponse(BaseModel):
    success: bool
    backup_path: Optional[str] = None
    timestamp: Optional[str] = None
    reason: Optional[str] = None
    stats: Dict[str, int] = {}
    error: Optional[str] = None


class RestoreResponse(BaseModel):
    success: bool
    backup_name: Optional[str] = None
    restored_stats: Dict[str, int] = {}
    previous_stats: Dict[str, int] = {}
    error: Optional[str] = None


class IntegrityResponse(BaseModel):
    healthy: bool
    current_stats: Dict[str, int] = {}
    warnings: List[str] = []
    recommendations: List[str] = []


class EmergencyRecoveryResponse(BaseModel):
    success: bool
    action: Optional[str] = None
    details: Dict[str, Any] = {}
    error: Optional[str] = None


@router.get("/list", response_model=List[BackupInfo])
async def list_backups():
    backups = backup_service.list_backups()
    return [BackupInfo(**b) for b in backups]


@router.post("/create", response_model=BackupResponse)
async def create_backup(reason: str = "manual"):
    result = backup_service.create_backup(reason)
    return BackupResponse(**result)


@router.post("/restore/{backup_name}", response_model=RestoreResponse)
async def restore_backup(backup_name: str):
    result = backup_service.restore_backup(backup_name)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Restore failed"))
    return RestoreResponse(**result)


@router.get("/integrity", response_model=IntegrityResponse)
async def check_integrity():
    result = backup_service.check_data_integrity()
    return IntegrityResponse(**result)


@router.post("/emergency-recovery", response_model=EmergencyRecoveryResponse)
async def emergency_recovery():
    result = backup_service.emergency_recovery()
    return EmergencyRecoveryResponse(**result)


@router.get("/stats")
async def get_current_stats():
    from app.services.backup_service import DB_PATH
    stats = backup_service._get_db_stats(DB_PATH)
    return {
        "database": "interactive_docs.db",
        "stats": stats,
        "backup_directory": backup_service.BACKUP_DIR if hasattr(backup_service, 'BACKUP_DIR') else "backups"
    }


@router.post("/start-scheduled")
async def start_scheduled_backups(interval_hours: int = 6):
    backup_service.start_scheduled_backups(interval_hours)
    return {
        "success": True,
        "message": f"Scheduled backups started (every {interval_hours} hours)"
    }


@router.post("/stop-scheduled")
async def stop_scheduled_backups():
    backup_service.stop_scheduled_backups()
    return {
        "success": True,
        "message": "Scheduled backups stopped"
    }
