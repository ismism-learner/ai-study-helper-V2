from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models import WorldTimelineEvent, BookDocument, Document, DocumentTimelineEvent

router = APIRouter()


class TimelineEventCreate(BaseModel):
    event_date: str  # 格式：YYYY-MM-DD 或 YYYY-MM 或 YYYY
    event_date_display: str  # 显示格式
    page_number: int
    event_title: str
    event_description: Optional[str] = None
    importance: Optional[str] = "normal"  # low, normal, high
    tags: Optional[List[str]] = None


class TimelineEventUpdate(BaseModel):
    event_date: Optional[str] = None
    event_date_display: Optional[str] = None
    page_number: Optional[int] = None
    event_title: Optional[str] = None
    event_description: Optional[str] = None
    importance: Optional[str] = None
    tags: Optional[List[str]] = None


class TimelineEventResponse(BaseModel):
    id: str
    book_id: str
    event_date: str
    event_date_display: str
    page_number: int
    event_title: str
    event_description: Optional[str]
    importance: str
    tags: Optional[List[str]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookTimelineSummary(BaseModel):
    book_id: str
    book_title: str
    total_events: int
    date_range: Optional[str] = None  # 如："公元前221年 - 公元2024年"


def _build_event_response(event: WorldTimelineEvent) -> TimelineEventResponse:
    return TimelineEventResponse(
        id=event.id,
        book_id=event.book_id,
        event_date=event.event_date,
        event_date_display=event.event_date_display,
        page_number=event.page_number,
        event_title=event.event_title,
        event_description=event.event_description,
        importance=event.importance,
        tags=event.tags,
        created_at=event.created_at,
        updated_at=event.updated_at
    )


@router.get("/books/{book_id}/timeline-events", response_model=List[TimelineEventResponse])
def get_book_timeline_events(
    book_id: str,
    sort_by: Optional[str] = "date",  # date, page, created
    order: Optional[str] = "asc",
    db: Session = Depends(get_db)
):
    """获取指定书籍的所有时间节点记录"""
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    query = db.query(WorldTimelineEvent).filter(WorldTimelineEvent.book_id == book_id)

    # 排序
    if sort_by == "date":
        query = query.order_by(
            WorldTimelineEvent.event_date.asc() if order == "asc" else WorldTimelineEvent.event_date.desc()
        )
    elif sort_by == "page":
        query = query.order_by(
            WorldTimelineEvent.page_number.asc() if order == "asc" else WorldTimelineEvent.page_number.desc()
        )
    elif sort_by == "created":
        query = query.order_by(
            WorldTimelineEvent.created_at.asc() if order == "asc" else WorldTimelineEvent.created_at.desc()
        )
    else:
        query = query.order_by(WorldTimelineEvent.event_date.asc())

    events = query.all()
    return [_build_event_response(event) for event in events]


@router.post("/books/{book_id}/timeline-events", response_model=TimelineEventResponse)
def create_timeline_event(
    book_id: str,
    data: TimelineEventCreate,
    db: Session = Depends(get_db)
):
    """为指定书籍创建新的时间节点记录"""
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    event = WorldTimelineEvent(
        book_id=book_id,
        event_date=data.event_date,
        event_date_display=data.event_date_display,
        page_number=data.page_number,
        event_title=data.event_title,
        event_description=data.event_description,
        importance=data.importance or "normal",
        tags=data.tags
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return _build_event_response(event)


@router.put("/timeline-events/{event_id}", response_model=TimelineEventResponse)
def update_timeline_event(
    event_id: str,
    data: TimelineEventUpdate,
    db: Session = Depends(get_db)
):
    """更新时间节点记录"""
    event = db.query(WorldTimelineEvent).filter(WorldTimelineEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Timeline event not found")

    if data.event_date is not None:
        event.event_date = data.event_date
    if data.event_date_display is not None:
        event.event_date_display = data.event_date_display
    if data.page_number is not None:
        event.page_number = data.page_number
    if data.event_title is not None:
        event.event_title = data.event_title
    if data.event_description is not None:
        event.event_description = data.event_description
    if data.importance is not None:
        event.importance = data.importance
    if data.tags is not None:
        event.tags = data.tags

    db.commit()
    db.refresh(event)

    return _build_event_response(event)


@router.delete("/timeline-events/{event_id}")
def delete_timeline_event(event_id: str, db: Session = Depends(get_db)):
    """删除时间节点记录"""
    event = db.query(WorldTimelineEvent).filter(WorldTimelineEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Timeline event not found")

    db.delete(event)
    db.commit()

    return {"message": "Timeline event deleted successfully"}


@router.get("/timeline-events/{event_id}", response_model=TimelineEventResponse)
def get_timeline_event(event_id: str, db: Session = Depends(get_db)):
    """获取单个时间节点记录详情"""
    event = db.query(WorldTimelineEvent).filter(WorldTimelineEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Timeline event not found")

    return _build_event_response(event)


@router.get("/library/timeline-summary", response_model=List[BookTimelineSummary])
def get_library_timeline_summary(db: Session = Depends(get_db)):
    """获取书库中所有书籍的时间节点汇总信息"""
    books = db.query(BookDocument).all()
    result = []

    for book in books:
        events = db.query(WorldTimelineEvent).filter(
            WorldTimelineEvent.book_id == book.id
        ).order_by(WorldTimelineEvent.event_date).all()

        if events:
            total_events = len(events)
            first_event = events[0]
            last_event = events[-1]

            date_range = None
            if first_event.event_date_display and last_event.event_date_display:
                if first_event.event_date_display == last_event.event_date_display:
                    date_range = first_event.event_date_display
                else:
                    date_range = f"{first_event.event_date_display} - {last_event.event_date_display}"

            result.append(BookTimelineSummary(
                book_id=book.id,
                book_title=book.title,
                total_events=total_events,
                date_range=date_range
            ))

    return sorted(result, key=lambda x: x.total_events, reverse=True)


@router.get("/library/timeline-events/search")
def search_timeline_events(
    query: Optional[str] = None,
    book_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    importance: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """搜索时间节点记录"""
    db_query = db.query(WorldTimelineEvent)

    if book_id:
        db_query = db_query.filter(WorldTimelineEvent.book_id == book_id)

    if query:
        db_query = db_query.filter(
            (WorldTimelineEvent.event_title.ilike(f"%{query}%")) |
            (WorldTimelineEvent.event_description.ilike(f"%{query}%"))
        )

    if date_from:
        db_query = db_query.filter(WorldTimelineEvent.event_date >= date_from)
    if date_to:
        db_query = db_query.filter(WorldTimelineEvent.event_date <= date_to)

    if importance:
        db_query = db_query.filter(WorldTimelineEvent.importance == importance)

    events = db_query.order_by(WorldTimelineEvent.event_date).all()
    return [_build_event_response(event) for event in events]


@router.get("/library/timeline-events/all")
def get_all_timeline_events(db: Session = Depends(get_db)):
    """获取所有时间节点记录（包含书籍标签信息）"""
    # 查询 WorldTimelineEvent（关联到书籍）
    world_events = db.query(WorldTimelineEvent).order_by(WorldTimelineEvent.event_date).all()
    # 查询 DocumentTimelineEvent（直接关联到文档）
    document_events = db.query(DocumentTimelineEvent).order_by(DocumentTimelineEvent.event_date).all()
    
    result = []
    
    # 处理 WorldTimelineEvent
    for event in world_events:
        book = db.query(BookDocument).filter(BookDocument.id == event.book_id).first()
        event_data = {
            "id": event.id,
            "book_id": event.book_id,
            "document_id": None,
            "event_date": event.event_date,
            "event_date_display": event.event_date_display,
            "page_number": event.page_number,
            "event_title": event.event_title,
            "event_description": event.event_description,
            "importance": event.importance,
            "tags": event.tags or (book.tags if book and book.tags else []),
            "book_tags": book.tags if book and book.tags else [],
            "book_title": book.title if book else None,
            "document_title": None,
            "created_at": event.created_at,
            "updated_at": event.updated_at
        }
        result.append(event_data)
    
    # 处理 DocumentTimelineEvent
    for event in document_events:
        doc = db.query(Document).filter(Document.id == event.document_id).first()
        event_data = {
            "id": event.id,
            "book_id": None,
            "document_id": event.document_id,
            "event_date": event.event_date,
            "event_date_display": event.event_date_display,
            "page_number": None,  # DocumentTimelineEvent 没有 page_number 字段
            "event_title": event.event_title,
            "event_description": event.event_description,
            "importance": event.importance,
            "tags": event.tags or (doc.tags if doc and doc.tags else []),
            "book_tags": [],
            "book_title": None,
            "document_title": doc.title if doc else None,
            "created_at": event.created_at,
            "updated_at": event.updated_at
        }
        result.append(event_data)
    
    # 按日期排序
    result.sort(key=lambda x: x['event_date'])
    
    return result


# 这些路由已移至 documents.py，避免路径冲突
# 现在使用 /documents/{doc_id}/timeline-events 直接关联到文档
