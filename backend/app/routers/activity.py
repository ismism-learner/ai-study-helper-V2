from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta, UTC
from typing import Optional, List, Any

from ..database import get_db
from ..models import ActivityLog, BookDocument, WorldTimelineEvent

router = APIRouter(tags=["activity"])


class ActivityResponse(BaseModel):
    id: str
    action_type: str
    description: str
    details: Optional[dict]
    book_id: Optional[str]
    document_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[ActivityResponse])
def get_activities(limit: int = 10, db: Session = Depends(get_db)):
    """获取最近的活动日志"""
    activities = (
        db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit).all()
    )
    return activities


@router.post("", response_model=ActivityResponse)
def create_activity(
    action_type: str,
    description: str,
    book_id: Optional[str] = None,
    document_id: Optional[str] = None,
    details: Optional[dict] = None,
    db: Session = Depends(get_db),
):
    """创建活动日志"""
    activity = ActivityLog(
        action_type=action_type,
        description=description,
        book_id=book_id,
        document_id=document_id,
        details=details,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.get("/stats")
def get_activity_stats(db: Session = Depends(get_db)):
    """获取今日活动统计"""
    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    today_uploads = (
        db.query(ActivityLog)
        .filter(ActivityLog.action_type == "upload", ActivityLog.created_at >= today)
        .count()
    )

    today_archives = (
        db.query(ActivityLog)
        .filter(ActivityLog.action_type == "archive", ActivityLog.created_at >= today)
        .count()
    )

    today_notes = (
        db.query(ActivityLog)
        .filter(ActivityLog.action_type == "note", ActivityLog.created_at >= today)
        .count()
    )

    today_tags = (
        db.query(ActivityLog)
        .filter(ActivityLog.action_type == "tag", ActivityLog.created_at >= today)
        .count()
    )

    return {
        "today_uploads": today_uploads,
        "today_archives": today_archives,
        "today_notes": today_notes,
        "today_tags": today_tags,
    }


def log_activity(
    db: Session,
    action_type: str,
    description: str,
    book_id: str = None,
    document_id: str = None,
    details: dict = None,
):
    """辅助函数：记录活动日志"""
    activity = ActivityLog(
        action_type=action_type,
        description=description,
        book_id=book_id,
        document_id=document_id,
        details=details,
    )
    db.add(activity)
    db.commit()
    return activity
