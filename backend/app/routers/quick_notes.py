from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import QuickNote, Document
from app.schemas import (
    QuickNoteCreate, QuickNoteUpdate, QuickNoteResponse,
    QuickNoteBatchProcessRequest, QuickNoteBatchProcessResponse, QuickNoteAIResult
)
from app.services.ai_service import ai_service

router = APIRouter()


@router.post("/quick-notes", response_model=QuickNoteResponse)
async def create_quick_note(note: QuickNoteCreate, db: Session = Depends(get_db)):
    db_note = QuickNote(
        content=note.content,
        title=note.title,
        tags=note.tags,
        group_id=note.group_id,
        group_name=note.group_name,
        source_document_id=note.source_document_id,
        source_page=note.source_page,
        source_type=note.source_type
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


@router.get("/quick-notes", response_model=List[QuickNoteResponse])
def list_quick_notes(
    is_processed: Optional[int] = None,
    group_id: Optional[str] = None,
    source_document_id: Optional[str] = None,
    source_page: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(QuickNote)
    
    if is_processed is not None:
        query = query.filter(QuickNote.is_processed == is_processed)
    
    if group_id:
        query = query.filter(QuickNote.group_id == group_id)
    
    if source_document_id:
        query = query.filter(QuickNote.source_document_id == source_document_id)
    
    if source_page is not None:
        query = query.filter(QuickNote.source_page == source_page)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (QuickNote.content.ilike(search_filter)) |
            (QuickNote.title.ilike(search_filter))
        )
    
    notes = query.order_by(QuickNote.created_at.desc()).offset(skip).limit(limit).all()
    return notes


@router.get("/quick-notes/groups")
def get_quick_note_groups(db: Session = Depends(get_db)):
    groups = db.query(
        QuickNote.group_id,
        QuickNote.group_name
    ).filter(
        QuickNote.group_id.isnot(None)
    ).distinct().all()
    
    group_counts = {}
    for note in db.query(QuickNote).filter(QuickNote.group_id.isnot(None)).all():
        if note.group_id not in group_counts:
            group_counts[note.group_id] = 0
        group_counts[note.group_id] += 1
    
    return {
        "groups": [
            {
                "id": g.group_id,
                "name": g.group_name,
                "count": group_counts.get(g.group_id, 0)
            }
            for g in groups
        ]
    }


@router.get("/quick-notes/stats")
def get_quick_note_stats(db: Session = Depends(get_db)):
    total = db.query(QuickNote).count()
    unprocessed = db.query(QuickNote).filter(QuickNote.is_processed == 0).count()
    processed = db.query(QuickNote).filter(QuickNote.is_processed == 1).count()
    
    return {
        "total": total,
        "unprocessed": unprocessed,
        "processed": processed
    }


@router.get("/quick-notes/{note_id}", response_model=QuickNoteResponse)
def get_quick_note(note_id: str, db: Session = Depends(get_db)):
    note = db.query(QuickNote).filter(QuickNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Quick note not found")
    return note


@router.put("/quick-notes/{note_id}", response_model=QuickNoteResponse)
async def update_quick_note(
    note_id: str,
    note_update: QuickNoteUpdate,
    db: Session = Depends(get_db)
):
    note = db.query(QuickNote).filter(QuickNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Quick note not found")
    
    update_data = note_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)
    
    db.commit()
    db.refresh(note)
    return note


@router.delete("/quick-notes/{note_id}")
def delete_quick_note(note_id: str, db: Session = Depends(get_db)):
    note = db.query(QuickNote).filter(QuickNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Quick note not found")
    
    db.delete(note)
    db.commit()
    return {"message": "Quick note deleted successfully"}


@router.post("/quick-notes/batch-delete")
def batch_delete_quick_notes(note_ids: List[str], db: Session = Depends(get_db)):
    deleted = 0
    for note_id in note_ids:
        note = db.query(QuickNote).filter(QuickNote.id == note_id).first()
        if note:
            db.delete(note)
            deleted += 1
    db.commit()
    return {"deleted": deleted, "total": len(note_ids)}


@router.post("/quick-notes/batch-process", response_model=QuickNoteBatchProcessResponse)
async def batch_process_quick_notes(
    request: QuickNoteBatchProcessRequest,
    db: Session = Depends(get_db)
):
    results = []
    success_count = 0
    failed_count = 0
    
    for note_id in request.note_ids:
        note = db.query(QuickNote).filter(QuickNote.id == note_id).first()
        if not note:
            failed_count += 1
            continue
        
        try:
            ai_result = await ai_service.generate_note(note.content)
            
            original_content = note.content
            note.original_content = original_content
            note.title = ai_result["title"]
            note.content = ai_result["content"]
            note.ai_processed = 1
            
            suggested_tags = []
            if note.tags:
                suggested_tags = note.tags
            else:
                try:
                    tag_prompt = f"""请为以下笔记内容生成3-5个相关标签，用逗号分隔：

{note.content}

只输出标签，不要其他内容："""
                    tags_response = await ai_service.generate_text(
                        tag_prompt,
                        system_prompt="你是一个专业的笔记分类助手，擅长为笔记生成准确的标签。"
                    )
                    suggested_tags = [t.strip() for t in tags_response.split(',') if t.strip()]
                    note.tags = suggested_tags
                except Exception:
                    pass
            
            if request.auto_convert:
                doc = Document(
                    title=note.title,
                    original_content=note.content,
                    tags=note.tags,
                    doc_type="text_document",
                    archive_status="unarchived_doc"
                )
                db.add(doc)
                db.flush()
                note.converted_document_id = doc.id
            
            note.is_processed = 1
            note.processed_at = datetime.utcnow()
            
            results.append(QuickNoteAIResult(
                note_id=note_id,
                original_content=original_content,
                generated_title=ai_result["title"],
                optimized_content=ai_result["content"],
                suggested_tags=suggested_tags
            ))
            success_count += 1
            
        except Exception as e:
            print(f"Failed to process note {note_id}: {str(e)}")
            failed_count += 1
    
    db.commit()
    
    return QuickNoteBatchProcessResponse(
        results=results,
        total=len(request.note_ids),
        success=success_count,
        failed=failed_count
    )


@router.post("/quick-notes/{note_id}/convert", response_model=QuickNoteResponse)
async def convert_quick_note_to_document(
    note_id: str,
    db: Session = Depends(get_db)
):
    note = db.query(QuickNote).filter(QuickNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Quick note not found")
    
    if note.converted_document_id:
        raise HTTPException(status_code=400, detail="Note already converted")
    
    if not note.title:
        note.title = f"笔记 {note.created_at.strftime('%Y-%m-%d %H:%M')}"
    
    doc = Document(
        title=note.title,
        original_content=note.content,
        tags=note.tags,
        doc_type="text_document",
        archive_status="unarchived_doc"
    )
    db.add(doc)
    db.flush()
    
    note.converted_document_id = doc.id
    note.is_processed = 1
    note.processed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(note)
    
    return note


@router.post("/quick-notes/create-group")
def create_quick_note_group(
    group_name: str,
    note_ids: Optional[List[str]] = None,
    db: Session = Depends(get_db)
):
    import uuid
    group_id = str(uuid.uuid4())
    
    if note_ids:
        db.query(QuickNote).filter(QuickNote.id.in_(note_ids)).update(
            {"group_id": group_id, "group_name": group_name},
            synchronize_session=False
        )
        db.commit()
    
    return {"group_id": group_id, "group_name": group_name}


@router.put("/quick-notes/{note_id}/move-to-group")
def move_quick_note_to_group(
    note_id: str,
    group_id: Optional[str] = None,
    group_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    note = db.query(QuickNote).filter(QuickNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Quick note not found")
    
    note.group_id = group_id
    note.group_name = group_name
    db.commit()
    db.refresh(note)
    
    return note
