from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta, UTC
from typing import List, Dict, Any
from collections import defaultdict
from app.database import get_db
from app.models import (
    Document,
    BookDocument,
    Country,
    DocumentTimelineEvent,
    WorldTimelineEvent,
)

router = APIRouter()


class DashboardStats:
    pass


@router.get("/overview")
def get_dashboard_overview(db: Session = Depends(get_db)):
    today = datetime.now(UTC).date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())

    total_documents = db.query(Document).count()
    total_books = db.query(BookDocument).count()

    today_notes = (
        db.query(DocumentTimelineEvent)
        .filter(
            and_(
                DocumentTimelineEvent.created_at >= today_start,
                DocumentTimelineEvent.created_at <= today_end,
            )
        )
        .count()
    )

    archived_books = _get_archived_books_count(db)
    unarchived_books = _get_unarchived_books_count(db)

    return {
        "total_documents": total_documents,
        "total_books": total_books,
        "today_notes": today_notes,
        "archived_books": archived_books,
        "unarchived_books": unarchived_books,
    }


@router.get("/archive-status")
def get_archive_status(db: Session = Depends(get_db)):
    total_books = db.query(BookDocument).count()

    archived_books = _get_archived_books_count(db)
    unarchived_books = _get_unarchived_books_count(db)

    return {
        "total": total_books,
        "archived": archived_books,
        "unarchived": unarchived_books,
    }


def _get_archived_books_count(db: Session) -> int:
    books_with_notes = (
        db.query(WorldTimelineEvent.book_id)
        .filter(WorldTimelineEvent.book_id.isnot(None))
        .distinct()
        .count()
    )
    return books_with_notes


def _get_unarchived_books_count(db: Session) -> int:
    total_books = db.query(BookDocument).count()
    books_with_notes = (
        db.query(WorldTimelineEvent.book_id)
        .filter(WorldTimelineEvent.book_id.isnot(None))
        .distinct()
        .count()
    )
    return total_books - books_with_notes


def _is_book_archived(book: BookDocument, db: Session) -> bool:
    notes_count = (
        db.query(WorldTimelineEvent)
        .filter(WorldTimelineEvent.book_id == book.id)
        .count()
    )
    return notes_count > 0


def _is_book_unarchived(book: BookDocument, db: Session) -> bool:
    notes_count = (
        db.query(WorldTimelineEvent)
        .filter(WorldTimelineEvent.book_id == book.id)
        .count()
    )
    return notes_count == 0


@router.get("/country-distribution")
def get_country_distribution(db: Session = Depends(get_db)):
    result = (
        db.query(
            Country.name, Country.id, func.count(BookDocument.id).label("book_count")
        )
        .outerjoin(
            BookDocument,
            (BookDocument.country_id == Country.id)
            | (BookDocument.content_region_id == Country.id)
            | (BookDocument.author_region_id == Country.id),
        )
        .group_by(Country.id, Country.name)
        .having(func.count(BookDocument.id) > 0)
        .order_by(func.count(BookDocument.id).desc())
        .limit(10)
        .all()
    )

    return [{"name": r.name, "value": r.book_count, "id": r.id} for r in result]


@router.get("/tags-distribution")
def get_tags_distribution(db: Session = Depends(get_db)):
    books = db.query(BookDocument).filter(BookDocument.tags.isnot(None)).all()

    tag_counts = defaultdict(int)
    for book in books:
        if book.tags:
            for tag in book.tags:
                if tag:
                    tag_counts[tag] += 1

    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return [{"name": tag, "value": count} for tag, count in sorted_tags]


@router.get("/unarchived-tags")
def get_unarchived_tags(db: Session = Depends(get_db)):
    books_with_notes = (
        db.query(WorldTimelineEvent.book_id)
        .filter(WorldTimelineEvent.book_id.isnot(None))
        .distinct()
        .subquery()
    )

    unarchived_books = (
        db.query(BookDocument)
        .filter(BookDocument.tags.isnot(None), ~BookDocument.id.in_(books_with_notes))
        .all()
    )

    tag_counts = defaultdict(int)
    for book in unarchived_books:
        if book.tags:
            for tag in book.tags:
                if tag:
                    tag_counts[tag] += 1

    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return [{"name": tag, "count": count} for tag, count in sorted_tags]


@router.get("/activity-heatmap")
def get_activity_heatmap(db: Session = Depends(get_db)):
    today = datetime.now(UTC).date()
    one_year_ago = today - timedelta(days=365)

    events = (
        db.query(DocumentTimelineEvent)
        .filter(DocumentTimelineEvent.created_at >= one_year_ago)
        .all()
    )

    daily_counts = defaultdict(int)
    for event in events:
        date_key = event.created_at.date().isoformat()
        daily_counts[date_key] += 1

    result = []
    current_date = one_year_ago
    while current_date <= today:
        date_key = current_date.isoformat()
        result.append({"date": date_key, "count": daily_counts.get(date_key, 0)})
        current_date += timedelta(days=1)

    return result


@router.get("/monthly-stats")
def get_monthly_stats(db: Session = Depends(get_db)):
    today = datetime.now(UTC).date()
    six_months_ago = today - timedelta(days=180)

    events = (
        db.query(DocumentTimelineEvent)
        .filter(DocumentTimelineEvent.created_at >= six_months_ago)
        .all()
    )

    monthly_counts = defaultdict(lambda: {"notes": 0, "documents": 0})

    for event in events:
        month_key = event.created_at.strftime("%Y-%m")
        monthly_counts[month_key]["notes"] += 1

    documents = db.query(Document).filter(Document.created_at >= six_months_ago).all()

    for doc in documents:
        month_key = doc.created_at.strftime("%Y-%m")
        monthly_counts[month_key]["documents"] += 1

    result = []
    for month_key in sorted(monthly_counts.keys()):
        result.append(
            {
                "month": month_key,
                "notes": monthly_counts[month_key]["notes"],
                "documents": monthly_counts[month_key]["documents"],
            }
        )

    return result
