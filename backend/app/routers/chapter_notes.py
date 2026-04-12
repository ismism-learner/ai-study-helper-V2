from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import ChapterNote
from app.schemas import (
    ChapterNoteCreate,
    ChapterNoteUpdate,
    ChapterNoteResponse,
    ChapterNoteGenerateRequest,
)
from app.services.chapter_note_service import (
    generate_chapter_note,
    generate_chapter_note_stream,
)

router = APIRouter()


@router.post("/chapter-notes", response_model=ChapterNoteResponse)
async def create_chapter_note(note: ChapterNoteCreate, db: Session = Depends(get_db)):
    db_note = ChapterNote(
        book_id=note.book_id,
        document_id=note.document_id,
        chapter_title=note.chapter_title,
        original_text=note.original_text,
        start_page=note.start_page,
        end_page=note.end_page,
        tags=note.tags,
        status="pending",
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    return db_note


@router.get("/chapter-notes", response_model=List[ChapterNoteResponse])
def list_chapter_notes(
    book_id: Optional[str] = None,
    document_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(ChapterNote)

    if book_id:
        query = query.filter(ChapterNote.book_id == book_id)
    if document_id:
        query = query.filter(ChapterNote.document_id == document_id)
    if status:
        query = query.filter(ChapterNote.status == status)

    notes = (
        query.order_by(ChapterNote.created_at.desc()).offset(skip).limit(limit).all()
    )
    return notes


@router.get("/chapter-notes/{note_id}", response_model=ChapterNoteResponse)
def get_chapter_note(note_id: str, db: Session = Depends(get_db)):
    note = db.query(ChapterNote).filter(ChapterNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Chapter note not found")
    return note


@router.put("/chapter-notes/{note_id}", response_model=ChapterNoteResponse)
async def update_chapter_note(
    note_id: str, note_update: ChapterNoteUpdate, db: Session = Depends(get_db)
):
    note = db.query(ChapterNote).filter(ChapterNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Chapter note not found")

    update_data = note_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)

    db.commit()
    db.refresh(note)
    return note


@router.delete("/chapter-notes/{note_id}")
def delete_chapter_note(note_id: str, db: Session = Depends(get_db)):
    note = db.query(ChapterNote).filter(ChapterNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Chapter note not found")

    db.delete(note)
    db.commit()
    return {"message": "Chapter note deleted successfully"}


@router.post("/chapter-notes/generate")
async def generate_chapter_note_markdown(
    request: ChapterNoteGenerateRequest, db: Session = Depends(get_db)
):
    try:
        markdown_content = await generate_chapter_note(
            original_text=request.original_text,
            chapter_title=request.chapter_title or "未命名章节",
        )
        return {"markdown_content": markdown_content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成笔记失败: {str(e)}")


@router.post("/chapter-notes/generate-stream")
async def generate_chapter_note_markdown_stream(
    request: ChapterNoteGenerateRequest, db: Session = Depends(get_db)
):
    async def event_generator():
        try:
            async for chunk in generate_chapter_note_stream(
                original_text=request.original_text,
                chapter_title=request.chapter_title or "未命名章节",
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/chapter-notes/{note_id}/generate")
async def generate_and_save_chapter_note(note_id: str, db: Session = Depends(get_db)):
    note = db.query(ChapterNote).filter(ChapterNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Chapter note not found")

    try:
        note.status = "generating"
        db.commit()

        markdown_content = await generate_chapter_note(
            original_text=note.original_text, chapter_title=note.chapter_title
        )

        note.markdown_content = markdown_content
        note.status = "completed"
        db.commit()
        db.refresh(note)

        return note
    except Exception as e:
        note.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"生成笔记失败: {str(e)}")


@router.post("/chapter-notes/export")
async def export_chapter_notes(
    book_id: Optional[str] = None,
    document_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(ChapterNote).filter(ChapterNote.status == "completed")

    if book_id:
        query = query.filter(ChapterNote.book_id == book_id)
    if document_id:
        query = query.filter(ChapterNote.document_id == document_id)

    notes = query.order_by(
        ChapterNote.start_page.asc(), ChapterNote.created_at.asc()
    ).all()

    if not notes:
        raise HTTPException(status_code=404, detail="没有可导出的笔记")

    combined = []
    for note in notes:
        combined.append(f"# {note.chapter_title}\n\n{note.markdown_content}")

    full_content = "\n\n---\n\n".join(combined)

    return {"content": full_content, "chapter_count": len(notes)}
