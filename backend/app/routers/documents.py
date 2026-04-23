from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
import tempfile
import os
import json
from pydantic import BaseModel
from app.database import get_db
from app.models import Document, Highlight, DocumentTimelineEvent
from app.schemas import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    HighlightCreate,
    HighlightResponse,
    ExplainRequest,
    ExplainResponse,
    ParagraphOptimizeRequest,
    ParagraphOptimizeResponse,
    NotePolishRequest,
    NotePolishResponse,
    DocumentTimelineEventCreate,
    DocumentTimelineEventUpdate,
    DocumentTimelineEventResponse,
)
from app.services.ai_service import ai_service
from app.services.document_processor import DocumentProcessor
from app.services.file_parser import FileParser

router = APIRouter()


@router.post("/documents/upload-batch", response_model=List[DocumentResponse])
async def upload_documents(
    files: List[UploadFile] = File(...),
    folder_id: str = None,
    archive_status: str = "unarchived_doc",
    doc_type: str = "text_document",
    db: Session = Depends(get_db),
):
    results = []
    for file in files:
        if not file.filename:
            continue

        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in [".md", ".markdown", ".docx", ".doc", ".pdf", ".txt"]:
            continue

        title = os.path.splitext(file.filename)[0]
        tmp_path = None

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
                content = await file.read()
                tmp_file.write(content)
                tmp_path = tmp_file.name

            content_text = ""
            if file_ext in [".md", ".markdown", ".docx", ".doc", ".txt"]:
                content_text = FileParser.parse_file(tmp_path, file_ext)

            # 根据文件类型确定doc_type
            determined_doc_type = "pdf_ebook" if file_ext == ".pdf" else "text_document"

            db_doc = Document(
                title=title,
                original_content=content_text,
                folder_id=folder_id,
                archive_status=archive_status,
                doc_type=determined_doc_type,
                file_path=tmp_path if file_ext == ".pdf" else None,
            )
            db.add(db_doc)
            db.commit()
            db.refresh(db_doc)
            results.append(db_doc)

        except Exception as e:
            print(f"Error processing file {file.filename}: {e}")
            continue

        finally:
            if tmp_path and os.path.exists(tmp_path) and file_ext != ".pdf":
                os.unlink(tmp_path)

    return results


@router.post("/documents/upload-with-path", response_model=DocumentResponse)
async def upload_document_with_path(
    file: UploadFile = File(...),
    title: str = Form(...),
    relative_path: Optional[str] = Form(None),
    archive_status: str = Form("unarchived_doc"),
    db: Session = Depends(get_db),
):
    """
    上传文档并保留文件夹层级结构

    relative_path: 文件的相对路径，格式为 "文件夹名/子文件夹/文件名.docx"
    系统会根据相对路径自动创建文件夹层级结构
    """
    print(f"\n=== 上传文档请求（带路径）===")
    print(f"文件名: {file.filename}")
    print(f"标题: {title}")
    print(f"相对路径: {relative_path}")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".md", ".markdown", ".docx", ".doc", ".pdf", ".txt"]:
        raise HTTPException(
            status_code=400,
            detail=f"Only MD, DOCX, DOC, PDF and TXT files are supported, got {file_ext}",
        )

    # 根据相对路径创建文件夹层级结构
    folder_id = None
    if relative_path:
        folder_id = await create_folder_structure_from_path(relative_path, db)
        print(f"创建的文件夹ID: {folder_id}")

    # 确保标题只包含文件名，不包含任何路径信息
    # 从file.filename中提取纯文件名（去除可能的路径前缀）
    pure_filename = os.path.basename(file.filename.replace("\\", "/"))
    title = os.path.splitext(pure_filename)[0]

    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name

        content_text = ""
        if file_ext in [".md", ".markdown", ".docx", ".doc", ".txt"]:
            content_text = FileParser.parse_file(tmp_path, file_ext)

        # 根据文件类型确定doc_type
        determined_doc_type = "pdf_ebook" if file_ext == ".pdf" else "text_document"

        db_doc = Document(
            title=title,
            original_content=content_text,
            folder_id=folder_id,
            archive_status=archive_status,
            doc_type=determined_doc_type,
            file_path=tmp_path if file_ext == ".pdf" else None,
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)

        print(f"文档上传成功: {title}, folder_id: {folder_id}")
        return db_doc

    except Exception as e:
        print(f"上传失败: {str(e)}")
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


async def create_folder_structure_from_path(relative_path: str, db: Session) -> str:
    """
    根据相对路径创建文件夹层级结构

    Args:
        relative_path: 文件的相对路径，格式为 "文件夹名/子文件夹/文件名.docx"
        db: 数据库会话

    Returns:
        最终文件夹的ID
    """
    from app.models import Folder

    # 分割路径，去掉最后的文件名
    path_parts = relative_path.replace("\\", "/").split("/")
    if len(path_parts) <= 1:
        # 没有文件夹结构，直接返回None
        return None

    # 去掉最后的文件名，只保留文件夹路径
    folder_parts = path_parts[:-1]

    parent_id = None
    current_folder_id = None

    for folder_name in folder_parts:
        # 查找是否已存在同名文件夹
        existing_folder = (
            db.query(Folder)
            .filter(Folder.name == folder_name, Folder.parent_id == parent_id)
            .first()
        )

        if existing_folder:
            current_folder_id = existing_folder.id
            print(f"文件夹已存在: {folder_name} (id: {current_folder_id})")
        else:
            # 创建新文件夹
            new_folder = Folder(name=folder_name, parent_id=parent_id)
            db.add(new_folder)
            db.commit()
            db.refresh(new_folder)
            current_folder_id = new_folder.id
            print(
                f"创建文件夹: {folder_name} (id: {current_folder_id}, parent_id: {parent_id})"
            )

        parent_id = current_folder_id

    return current_folder_id


@router.post("/documents/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    folder_id: str = None,
    archive_status: str = "unarchived_doc",
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="没有选择文件")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".md", ".markdown", ".docx", ".pdf", ".txt"]:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的格式: {file_ext}，只支持 .md, .docx, .pdf, .txt",
        )

    title = os.path.splitext(file.filename)[0]

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name

        content_text = ""
        if file_ext in [".md", ".markdown", ".docx", ".txt"]:
            content_text = FileParser.parse_file(tmp_path, file_ext)

        # 根据文件类型确定doc_type
        doc_type = "pdf_ebook" if file_ext == ".pdf" else "text_document"

        db_doc = Document(
            title=title,
            original_content=content_text,
            folder_id=folder_id,
            archive_status=archive_status,
            doc_type=doc_type,
            file_path=tmp_path if file_ext == ".pdf" else None,
        )
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)

        return db_doc

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")

    finally:
        if tmp_path and os.path.exists(tmp_path) and file_ext != ".pdf":
            os.unlink(tmp_path)


@router.post("/documents", response_model=DocumentResponse)
async def create_document(doc: DocumentCreate, db: Session = Depends(get_db)):
    db_doc = Document(
        title=doc.title, original_content=doc.original_content, folder_id=doc.folder_id
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    return db_doc


@router.get("/documents", response_model=List[DocumentResponse])
def list_documents(
    folder_id: str = None,
    archive_status: str = None,
    doc_type: str = None,
    tag: str = None,
    search: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(Document)

    if folder_id:
        query = query.filter(Document.folder_id == folder_id)

    if archive_status:
        query = query.filter(Document.archive_status == archive_status)

    if doc_type:
        query = query.filter(Document.doc_type == doc_type)

    if tag:
        query = query.filter(Document.tags.contains([tag]))

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (Document.title.ilike(search_filter))
            | (Document.original_content.ilike(search_filter))
            | (Document.description.ilike(search_filter))
        )

    documents = (
        query.options(joinedload(Document.highlights))
        .order_by(Document.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    doc_ids = [d.id for d in documents]
    count_rows = (
        db.query(
            DocumentTimelineEvent.document_id, func.count(DocumentTimelineEvent.id)
        )
        .filter(DocumentTimelineEvent.document_id.in_(doc_ids))
        .group_by(DocumentTimelineEvent.document_id)
        .all()
    )
    count_map = dict(count_rows)

    result = []
    for doc in documents:
        doc_dict = {
            "id": doc.id,
            "title": doc.title,
            "original_content": doc.original_content[:200] + "..."
            if doc.original_content and len(doc.original_content) > 200
            else doc.original_content,
            "framework_content": None,
            "processed_content": None,
            "folder_id": doc.folder_id,
            "archive_status": doc.archive_status,
            "doc_type": doc.doc_type,
            "tags": doc.tags,
            "author": doc.author,
            "description": doc.description,
            "file_path": doc.file_path,
            "source_book_id": doc.source_book_id,
            "external_link": doc.external_link,
            "content_country_id": doc.content_country_id,
            "content_year_start": doc.content_year_start,
            "content_year_end": doc.content_year_end,
            "created_at": doc.created_at,
            "updated_at": doc.updated_at,
            "highlights": doc.highlights,
            "timeline_events_count": count_map.get(doc.id, 0),
        }
        result.append(doc_dict)

    return result


@router.get("/documents/tags", response_model=List[str])
def get_all_document_tags(db: Session = Depends(get_db)):
    """获取所有文档标签"""
    documents = db.query(Document.tags).filter(Document.tags != None).all()
    tags = set()
    for doc_tags in documents:
        if doc_tags[0]:
            tags.update(doc_tags[0])
    return sorted(list(tags))


@router.get("/documents/timeline-tags-history")
def get_timeline_tags_history(db: Session = Depends(get_db)):
    """
    获取所有时间笔记使用过的标签历史，用于快速选择
    包括：DocumentTimelineEvent、WorldTimelineEvent、Document、BookDocument 的标签
    """
    from app.models import BookDocument, WorldTimelineEvent

    tags_count = {}

    # 1. 从 DocumentTimelineEvent 获取标签
    doc_events = (
        db.query(DocumentTimelineEvent.tags)
        .filter(DocumentTimelineEvent.tags != None)
        .all()
    )
    for event_tags in doc_events:
        if event_tags[0]:
            for tag in event_tags[0]:
                tags_count[tag] = tags_count.get(tag, 0) + 1

    # 2. 从 WorldTimelineEvent 获取标签
    world_events = (
        db.query(WorldTimelineEvent.tags).filter(WorldTimelineEvent.tags != None).all()
    )
    for event_tags in world_events:
        if event_tags[0]:
            for tag in event_tags[0]:
                tags_count[tag] = tags_count.get(tag, 0) + 1

    # 3. 从 Document 获取标签
    documents = db.query(Document.tags).filter(Document.tags != None).all()
    for doc_tags in documents:
        if doc_tags[0]:
            for tag in doc_tags[0]:
                tags_count[tag] = tags_count.get(tag, 0) + 1

    # 4. 从 BookDocument 获取标签
    books = db.query(BookDocument.tags).filter(BookDocument.tags != None).all()
    for book_tags in books:
        if book_tags[0]:
            for tag in book_tags[0]:
                tags_count[tag] = tags_count.get(tag, 0) + 1

    sorted_tags = sorted(tags_count.items(), key=lambda x: x[1], reverse=True)

    return {
        "tags": [tag for tag, count in sorted_tags],
        "tags_with_count": [{"tag": tag, "count": count} for tag, count in sorted_tags],
    }


@router.get("/documents/stats")
def get_document_stats(db: Session = Depends(get_db)):
    total = db.query(Document).count()
    archive_rows = (
        db.query(Document.archive_status, func.count(Document.id))
        .group_by(Document.archive_status)
        .all()
    )
    type_rows = (
        db.query(Document.doc_type, func.count(Document.id))
        .group_by(Document.doc_type)
        .all()
    )
    archive_map = dict(archive_rows)
    type_map = dict(type_rows)
    stats = {
        "total": total,
        "unarchived_book": archive_map.get("unarchived_book", 0),
        "archived_book": archive_map.get("archived_book", 0),
        "unarchived_doc": archive_map.get("unarchived_doc", 0),
        "archived_doc": archive_map.get("archived_doc", 0),
        "pdf_ebook": type_map.get("pdf_ebook", 0),
        "text_document": type_map.get("text_document", 0),
    }
    return stats


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/documents/{doc_id}/generate-framework", response_model=DocumentResponse)
async def generate_framework(doc_id: str, db: Session = Depends(get_db)):
    """
    生成文档正文（文章正文）
    从原文内容生成经过AI处理的文章正文，保存到 framework_content 字段
    使用用户保存的 framework_prompt 提示词模板
    """
    from app.config import settings_manager
    import traceback

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not doc.original_content:
        raise HTTPException(status_code=400, detail="文档没有原文内容")

    try:
        prompt_template = settings_manager.framework_prompt
        content_to_process = doc.original_content[:15000]

        print(f"[generate_framework] Processing document: {doc.title}")
        print(f"[generate_framework] Content length: {len(content_to_process)}")
        print(f"[generate_framework] Prompt template length: {len(prompt_template)}")

        prompt = prompt_template.replace("{content}", content_to_process)

        generated_content = await ai_service.generate_text(
            prompt,
            system_prompt="你是一个专业的中文编辑，擅长将口语化内容转化为高质量的书面文章。",
        )

        doc.framework_content = generated_content
        db.commit()
        db.refresh(doc)

        print(
            f"[generate_framework] Successfully generated content for document: {doc.title}"
        )
        return doc

    except ValueError as e:
        error_msg = str(e)
        print(f"ValueError generating framework for document {doc_id}: {error_msg}")
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        error_msg = str(e)
        error_type = type(e).__name__
        print(
            f"Error generating framework for document {doc_id}: {error_type}: {error_msg}"
        )
        traceback.print_exc()

        if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=504,
                detail=f"请求超时：模型响应时间过长，请尝试缩短内容或稍后重试。详情：{error_msg}",
            )
        elif "api key" in error_msg.lower() or "authentication" in error_msg.lower():
            raise HTTPException(
                status_code=401,
                detail=f"API认证失败：请检查API Key设置。详情：{error_msg}",
            )
        elif "model" in error_msg.lower() and "not found" in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail=f"模型不存在：请检查模型名称设置。详情：{error_msg}",
            )
        elif "context" in error_msg.lower() and "length" in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail=f"内容过长：超出模型上下文限制。详情：{error_msg}",
            )
        else:
            raise HTTPException(status_code=500, detail=f"生成正文失败: {error_msg}")


def _save_framework_content(doc_id: str, content: str) -> bool:
    """使用独立数据库会话保存内容，确保保存成功"""
    from app.database import SessionLocal

    db_session = None
    try:
        db_session = SessionLocal()
        doc = db_session.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.framework_content = content
            db_session.commit()
            print(
                f"[_save_framework_content] Successfully saved {len(content)} chars for doc: {doc_id}"
            )
            return True
        else:
            print(f"[_save_framework_content] Document not found: {doc_id}")
            return False
    except Exception as e:
        print(f"[_save_framework_content] Failed to save: {e}")
        if db_session:
            db_session.rollback()
        return False
    finally:
        if db_session:
            db_session.close()


@router.post("/documents/{doc_id}/generate-framework-stream")
async def generate_framework_stream(doc_id: str, db: Session = Depends(get_db)):
    """
    流式生成文档正文
    使用Server-Sent Events (SSE)实时返回生成的内容

    关键修复：使用独立数据库会话保存内容，避免请求中止时数据库会话被关闭导致保存失败
    """
    from app.config import settings_manager
    import traceback

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not doc.original_content:
        raise HTTPException(status_code=400, detail="文档没有原文内容")

    prompt_template = settings_manager.framework_prompt
    content_to_process = doc.original_content[:15000]
    doc_title = doc.title

    print(f"[generate_framework_stream] Processing document: {doc_title}")
    print(f"[generate_framework_stream] Content length: {len(content_to_process)}")

    prompt = prompt_template.replace("{content}", content_to_process)

    async def event_generator():
        full_content = ""
        save_interval = 50
        chunk_count = 0

        try:
            async for chunk in ai_service.generate_text_stream(
                prompt,
                system_prompt="你是一个专业的中文编辑，擅长将口语化内容转化为高质量的书面文章。",
            ):
                full_content += chunk
                chunk_count += 1
                data = json.dumps({"content": chunk, "done": False}, ensure_ascii=False)
                yield f"data: {data}\n\n"

                if chunk_count % save_interval == 0 and full_content:
                    _save_framework_content(doc_id, full_content)

            _save_framework_content(doc_id, full_content)

            print(
                f"[generate_framework_stream] Successfully generated content for: {doc_title}"
            )
            data = json.dumps(
                {"content": "", "done": True, "full_content": full_content},
                ensure_ascii=False,
            )
            yield f"data: {data}\n\n"

        except ValueError as e:
            error_msg = str(e)
            print(f"ValueError in stream: {error_msg}")
            traceback.print_exc()

            if full_content:
                _save_framework_content(doc_id, full_content)

            data = json.dumps({"error": error_msg, "done": True}, ensure_ascii=False)
            yield f"data: {data}\n\n"
        except Exception as e:
            error_msg = str(e)
            print(f"Error in stream: {type(e).__name__}: {error_msg}")
            traceback.print_exc()

            if full_content:
                _save_framework_content(doc_id, full_content)

            data = json.dumps({"error": error_msg, "done": True}, ensure_ascii=False)
            yield f"data: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.put("/documents/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str, doc_update: DocumentUpdate, db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    update_data = doc_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(doc, key, value)

    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}


# 文档时间轴事件 API
@router.get(
    "/documents/{doc_id}/timeline-events",
    response_model=List[DocumentTimelineEventResponse],
)
def get_document_timeline_events(
    doc_id: str,
    sort_by: Optional[str] = "date",
    order: Optional[str] = "asc",
    db: Session = Depends(get_db),
):
    """获取文档的时间轴事件"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    query = db.query(DocumentTimelineEvent).filter(
        DocumentTimelineEvent.document_id == doc_id
    )

    if sort_by == "date":
        query = query.order_by(
            DocumentTimelineEvent.event_date.asc()
            if order == "asc"
            else DocumentTimelineEvent.event_date.desc()
        )
    elif sort_by == "created":
        query = query.order_by(
            DocumentTimelineEvent.created_at.asc()
            if order == "asc"
            else DocumentTimelineEvent.created_at.desc()
        )

    events = query.all()
    return events


@router.post(
    "/documents/{doc_id}/timeline-events", response_model=DocumentTimelineEventResponse
)
def create_document_timeline_event(
    doc_id: str, data: DocumentTimelineEventCreate, db: Session = Depends(get_db)
):
    """为文档创建时间轴事件"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    event = DocumentTimelineEvent(
        document_id=doc_id,
        event_date=data.event_date,
        event_date_display=data.event_date_display or data.event_date,
        event_title=data.event_title,
        event_description=data.event_description,
        importance=data.importance or "normal",
        tags=data.tags,
        page_number=data.page_number,
        content_offset=data.content_offset,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return event


@router.put(
    "/document-timeline-events/{event_id}", response_model=DocumentTimelineEventResponse
)
def update_document_timeline_event(
    event_id: str, data: DocumentTimelineEventUpdate, db: Session = Depends(get_db)
):
    """更新文档时间轴事件"""
    event = (
        db.query(DocumentTimelineEvent)
        .filter(DocumentTimelineEvent.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Timeline event not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)

    db.commit()
    db.refresh(event)
    return event


@router.delete("/document-timeline-events/{event_id}")
def delete_document_timeline_event(event_id: str, db: Session = Depends(get_db)):
    """删除文档时间轴事件"""
    event = (
        db.query(DocumentTimelineEvent)
        .filter(DocumentTimelineEvent.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Timeline event not found")

    db.delete(event)
    db.commit()
    return {"message": "Timeline event deleted successfully"}


@router.post("/documents/{doc_id}/highlights", response_model=HighlightResponse)
async def create_highlight(
    doc_id: str, highlight: HighlightCreate, db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db_highlight = Highlight(
        document_id=doc_id,
        highlighted_text=highlight.highlighted_text,
        start_offset=highlight.start_offset,
        end_offset=highlight.end_offset,
        highlight_type=highlight.highlight_type or "explanation",
        prompt_template=highlight.prompt_template,
    )
    db.add(db_highlight)
    db.commit()
    db.refresh(db_highlight)

    highlights_data = [
        {"id": h.id, "start_offset": h.start_offset, "end_offset": h.end_offset}
        for h in doc.highlights
    ]
    highlights_data.append(
        {
            "id": db_highlight.id,
            "start_offset": db_highlight.start_offset,
            "end_offset": db_highlight.end_offset,
        }
    )

    processed = DocumentProcessor.insert_highlight_links(
        doc.original_content, highlights_data
    )
    doc.processed_content = processed
    db.commit()

    return db_highlight


@router.get("/documents/{doc_id}/highlights", response_model=List[HighlightResponse])
def list_highlights(doc_id: str, db: Session = Depends(get_db)):
    highlights = db.query(Highlight).filter(Highlight.document_id == doc_id).all()
    return highlights


@router.delete("/highlights/{highlight_id}")
def delete_highlight(highlight_id: str, db: Session = Depends(get_db)):
    highlight = db.query(Highlight).filter(Highlight.id == highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")

    doc = highlight.document
    db.delete(highlight)
    db.commit()

    remaining_highlights = [
        {"id": h.id, "start_offset": h.start_offset, "end_offset": h.end_offset}
        for h in doc.highlights
    ]

    if remaining_highlights:
        doc.processed_content = DocumentProcessor.insert_highlight_links(
            doc.original_content, remaining_highlights
        )
    else:
        doc.processed_content = None
    db.commit()

    return {"message": "Highlight deleted successfully"}


@router.post("/highlights/explain", response_model=ExplainResponse)
async def explain_highlight(request: ExplainRequest, db: Session = Depends(get_db)):
    highlight = db.query(Highlight).filter(Highlight.id == request.highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")

    doc = highlight.document

    try:
        explanation = await ai_service.explain_highlight(
            highlighted_text=highlight.highlighted_text,
            full_content=doc.original_content,
            custom_prompt=request.custom_prompt or highlight.prompt_template,
        )

        highlight.explanation = explanation
        db.commit()

        return ExplainResponse(highlight_id=highlight.id, explanation=explanation)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate explanation: {str(e)}"
        )


@router.get("/highlights/{highlight_id}", response_model=HighlightResponse)
def get_highlight(highlight_id: str, db: Session = Depends(get_db)):
    highlight = db.query(Highlight).filter(Highlight.id == highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")
    return highlight


@router.put("/highlights/{highlight_id}", response_model=HighlightResponse)
def update_highlight(
    highlight_id: str, update_data: dict, db: Session = Depends(get_db)
):
    highlight = db.query(Highlight).filter(Highlight.id == highlight_id).first()
    if not highlight:
        raise HTTPException(status_code=404, detail="Highlight not found")

    if "explanation" in update_data:
        highlight.explanation = update_data["explanation"]
    if "highlight_type" in update_data:
        highlight.highlight_type = update_data["highlight_type"]
    if "prompt_template" in update_data:
        highlight.prompt_template = update_data["prompt_template"]

    db.commit()
    db.refresh(highlight)
    return highlight


@router.post("/optimize-paragraph", response_model=ParagraphOptimizeResponse)
async def optimize_paragraph(request: ParagraphOptimizeRequest):
    if not request.paragraph or not request.paragraph.strip():
        raise HTTPException(status_code=400, detail="段落内容不能为空")

    try:
        optimized = await ai_service.optimize_paragraph(request.paragraph)
        return ParagraphOptimizeResponse(
            original=request.paragraph, optimized=optimized
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"优化失败: {str(e)}")


@router.post("/optimize-paragraph-stream")
async def optimize_paragraph_stream(request: ParagraphOptimizeRequest):
    """
    流式优化段落
    使用Server-Sent Events (SSE)实时返回优化的内容
    """
    import traceback

    if not request.paragraph or not request.paragraph.strip():
        raise HTTPException(status_code=400, detail="段落内容不能为空")

    paragraph = request.paragraph

    print(f"[optimize_paragraph_stream] Processing paragraph length: {len(paragraph)}")

    async def event_generator():
        full_content = ""
        try:
            async for chunk in ai_service.optimize_paragraph_stream(paragraph):
                full_content += chunk
                data = json.dumps({"content": chunk, "done": False}, ensure_ascii=False)
                yield f"data: {data}\n\n"

            print(f"[optimize_paragraph_stream] Successfully optimized paragraph")
            data = json.dumps(
                {"content": "", "done": True, "full_content": full_content},
                ensure_ascii=False,
            )
            yield f"data: {data}\n\n"

        except ValueError as e:
            error_msg = str(e)
            print(f"ValueError in optimize stream: {error_msg}")
            traceback.print_exc()
            data = json.dumps({"error": error_msg, "done": True}, ensure_ascii=False)
            yield f"data: {data}\n\n"
        except Exception as e:
            error_msg = str(e)
            print(f"Error in optimize stream: {type(e).__name__}: {error_msg}")
            traceback.print_exc()
            data = json.dumps({"error": error_msg, "done": True}, ensure_ascii=False)
            yield f"data: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/polish-note", response_model=NotePolishResponse)
async def polish_note(request: NotePolishRequest):
    """
    润色笔记内容，将口语化表达转换为书面化表达
    """
    if not request.note_content or not request.note_content.strip():
        raise HTTPException(status_code=400, detail="笔记内容不能为空")

    try:
        polished = await ai_service.polish_note(request.note_content)
        return NotePolishResponse(original=request.note_content, polished=polished)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"润色失败: {str(e)}")


@router.post("/generate-note")
async def generate_note(request: NotePolishRequest):
    """
    一键生成笔记标题和内容
    根据用户输入的内容，生成规范的笔记标题和润色后的内容
    """
    if not request.note_content or not request.note_content.strip():
        raise HTTPException(status_code=400, detail="笔记内容不能为空")

    try:
        result = await ai_service.generate_note(request.note_content)
        return {"title": result["title"], "content": result["content"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成笔记失败: {str(e)}")


@router.post("/documents/check-duplicates-by-name")
async def check_duplicates_by_name(request: dict, db: Session = Depends(get_db)):
    """
    基于文件名的快速重复检测
    只检查文件名是否已存在，不计算文件哈希，速度非常快
    """
    filenames = request.get("filenames", [])

    if not filenames:
        return {"total_files": 0, "unique_files": [], "duplicate_files": []}

    duplicate_files = []
    unique_files = []

    # Batch query: extract all titles and check in one query
    titles = [os.path.splitext(filename)[0] for filename in filenames]
    existing_docs = db.query(Document).filter(Document.title.in_(titles)).all()
    existing_by_title = {doc.title: doc for doc in existing_docs}

    for filename in filenames:
        title = os.path.splitext(filename)[0]
        existing_doc = existing_by_title.get(title)

        if existing_doc:
            duplicate_files.append(
                {
                    "filename": filename,
                    "title": title,
                    "duplicate_type": "name",
                    "existing_id": existing_doc.id,
                    "existing_title": existing_doc.title,
                    "existing_author": existing_doc.author,
                }
            )
        else:
            unique_files.append({"filename": filename, "title": title})

    return {
        "total_files": len(filenames),
        "unique_files": unique_files,
        "duplicate_files": duplicate_files,
    }


@router.post("/documents/batch-generate-content")
async def batch_generate_content(request: dict, db: Session = Depends(get_db)):
    """
    批量生成文档正文
    接收文档ID列表，为每个文档生成正文内容
    使用用户保存的 framework_prompt 提示词模板
    """
    from app.config import settings_manager
    import asyncio
    import traceback

    document_ids = request.get("document_ids", [])

    if not document_ids:
        return {"success": False, "message": "No document IDs provided"}

    prompt_template = settings_manager.framework_prompt
    results = []

    print(
        f"[batch_generate_content] Starting batch generation for {len(document_ids)} documents"
    )

    for i, doc_id in enumerate(document_ids):
        doc = None
        try:
            if i > 0:
                await asyncio.sleep(2)

            doc = db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                results.append(
                    {
                        "id": doc_id,
                        "success": False,
                        "error": "文档不存在",
                        "error_type": "not_found",
                    }
                )
                continue

            if not doc.original_content:
                results.append(
                    {
                        "id": doc_id,
                        "success": False,
                        "error": "文档没有原文内容",
                        "error_type": "no_content",
                        "title": doc.title,
                    }
                )
                continue

            if doc.framework_content:
                print(
                    f"[batch_generate_content] Document {doc.title} already has framework_content, skipping"
                )
                results.append(
                    {
                        "id": doc_id,
                        "success": True,
                        "title": doc.title,
                        "skipped": True,
                        "message": "已有正文内容，跳过生成",
                    }
                )
                continue

            content_to_process = doc.original_content[:15000]
            print(
                f"[batch_generate_content] Processing document {i + 1}/{len(document_ids)}: {doc.title}"
            )
            print(f"[batch_generate_content] Content length: {len(content_to_process)}")

            prompt = prompt_template.replace("{content}", content_to_process)

            generated_content = await ai_service.generate_text(
                prompt,
                system_prompt="你是一个专业的中文编辑，擅长将口语化内容转化为高质量的书面文章。",
            )

            doc.framework_content = generated_content
            db.commit()

            results.append({"id": doc_id, "success": True, "title": doc.title})

            print(
                f"[batch_generate_content] Successfully generated content for: {doc.title}"
            )

        except ValueError as e:
            error_msg = str(e)
            print(f"ValueError for document {doc_id}: {error_msg}")
            traceback.print_exc()

            error_type = "api_error"
            if "api key" in error_msg.lower() or "authentication" in error_msg.lower():
                error_type = "auth_error"
            elif "model" in error_msg.lower() and "not found" in error_msg.lower():
                error_type = "model_error"
            elif "context" in error_msg.lower() and "length" in error_msg.lower():
                error_type = "context_too_long"

            results.append(
                {
                    "id": doc_id,
                    "success": False,
                    "error": error_msg,
                    "error_type": error_type,
                    "title": doc.title if doc else None,
                }
            )
        except asyncio.TimeoutError:
            error_msg = "请求超时"
            print(f"Timeout for document {doc_id}")
            results.append(
                {
                    "id": doc_id,
                    "success": False,
                    "error": error_msg,
                    "error_type": "timeout",
                    "title": doc.title if doc else None,
                }
            )
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            print(
                f"Error generating content for document {doc_id}: {error_type}: {error_msg}"
            )
            traceback.print_exc()

            classified_error_type = "unknown_error"
            if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                classified_error_type = "timeout"
                error_msg = "请求超时，请稍后重试"
            elif (
                "api key" in error_msg.lower() or "authentication" in error_msg.lower()
            ):
                classified_error_type = "auth_error"
                error_msg = "API认证失败，请检查API Key设置"
            elif "model" in error_msg.lower() and "not found" in error_msg.lower():
                classified_error_type = "model_error"
                error_msg = "模型不存在，请检查模型名称设置"
            elif "context" in error_msg.lower() and "length" in error_msg.lower():
                classified_error_type = "context_too_long"
                error_msg = "内容过长，超出模型上下文限制"
            elif (
                "rate limit" in error_msg.lower()
                or "too many requests" in error_msg.lower()
            ):
                classified_error_type = "rate_limit"
                error_msg = "API请求频率限制，请稍后重试"
            elif "connection" in error_msg.lower() or "network" in error_msg.lower():
                classified_error_type = "network_error"
                error_msg = "网络连接失败，请检查网络"

            results.append(
                {
                    "id": doc_id,
                    "success": False,
                    "error": error_msg,
                    "error_type": classified_error_type,
                    "title": doc.title if doc else None,
                }
            )

    return {
        "success": True,
        "results": results,
        "total": len(document_ids),
        "completed": sum(1 for r in results if r.get("success")),
        "failed": sum(1 for r in results if not r.get("success")),
    }


import re
from typing import List as TypingList


class TimelineNoteParseResult(BaseModel):
    event_date: str
    event_date_display: str
    event_title: str
    event_description: str
    tags: Optional[List[str]] = None


class SaveTimelineNotesBatchRequest(BaseModel):
    events: List[TimelineNoteParseResult]
    default_tags: Optional[List[str]] = None


class AIGenerateTimelineNotesRequest(BaseModel):
    custom_prompt: Optional[str] = None
    content: Optional[str] = None


class AIGenerateTimelineNotesResponse(BaseModel):
    raw_output: str
    parsed_events: List[TimelineNoteParseResult]
    total_events: int


class AIGenerateTimelineNotesFromContentRequest(BaseModel):
    content: str
    custom_prompt: Optional[str] = None


@router.post(
    "/documents/ai-generate-timeline-notes-from-content",
    response_model=AIGenerateTimelineNotesResponse,
)
async def ai_generate_timeline_notes_from_content(
    request: AIGenerateTimelineNotesFromContentRequest,
):
    """
    使用AI从文本内容中提取时间事件并生成规范化格式的时间笔记
    不需要文档ID，直接处理传入的文本内容
    """
    import traceback

    if not request.content or not request.content.strip():
        raise HTTPException(status_code=400, detail="内容不能为空")

    try:
        print(
            f"[ai_generate_timeline_notes_from_content] Processing content, length: {len(request.content)}"
        )

        raw_output = await ai_service.generate_timeline_notes(
            content=request.content, custom_prompt=request.custom_prompt
        )

        parsed_events = parse_timeline_notes_output(raw_output)

        print(
            f"[ai_generate_timeline_notes_from_content] Parsed {len(parsed_events)} events"
        )

        return AIGenerateTimelineNotesResponse(
            raw_output=raw_output,
            parsed_events=parsed_events,
            total_events=len(parsed_events),
        )

    except ValueError as e:
        error_msg = str(e)
        print(f"ValueError generating timeline notes: {error_msg}")
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        error_msg = str(e)
        print(f"Error generating timeline notes: {type(e).__name__}: {error_msg}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"生成时间笔记失败: {error_msg}")


def parse_timeline_notes_output(output: str) -> List[TimelineNoteParseResult]:
    """
    解析AI生成的时间笔记输出
    支持格式：
    - 单个事件：[YYYY-MM-DD/事件标题/简短内容解释]
    - 多个事件：{[时间1/内容1], [时间2/内容2], [时间3/内容3]}
    """
    results = []

    single_pattern = r"\[(-?\d+(?:-\d+(?:-\d+)?)?)/([^/]+)/([^\]]+)\]"

    matches = re.findall(single_pattern, output)

    for match in matches:
        date_str, title, description = match
        date_str = date_str.strip()
        title = title.strip()
        description = description.strip()

        event_date = date_str
        event_date_display = date_str

        if date_str.startswith("-"):
            year = int(date_str.split("-")[1])
            event_date = str(year)
            event_date_display = f"公元前{year}年"
        else:
            parts = date_str.split("-")
            year = int(parts[0])
            if len(parts) >= 2:
                month = int(parts[1])
                event_date_display = f"{year}年{month}月"
                if len(parts) >= 3:
                    day = int(parts[2])
                    event_date_display = f"{year}年{month}月{day}日"
            else:
                event_date_display = f"{year}年"

        results.append(
            TimelineNoteParseResult(
                event_date=event_date,
                event_date_display=event_date_display,
                event_title=title,
                event_description=description,
            )
        )

    return results


@router.post(
    "/documents/{doc_id}/ai-generate-timeline-notes",
    response_model=AIGenerateTimelineNotesResponse,
)
async def ai_generate_timeline_notes(
    doc_id: str,
    request: AIGenerateTimelineNotesRequest = None,
    db: Session = Depends(get_db),
):
    """
    使用AI从文档内容中提取时间事件并生成规范化格式的时间笔记
    """
    import traceback

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    content_to_process = (
        request.content if request and request.content else doc.original_content
    )
    if not content_to_process:
        raise HTTPException(status_code=400, detail="文档没有内容")

    try:
        print(f"[ai_generate_timeline_notes] Processing document: {doc.title}")
        print(f"[ai_generate_timeline_notes] Content length: {len(content_to_process)}")

        raw_output = await ai_service.generate_timeline_notes(
            content=content_to_process,
            custom_prompt=request.custom_prompt if request else None,
        )

        parsed_events = parse_timeline_notes_output(raw_output)

        print(f"[ai_generate_timeline_notes] Parsed {len(parsed_events)} events")

        return AIGenerateTimelineNotesResponse(
            raw_output=raw_output,
            parsed_events=parsed_events,
            total_events=len(parsed_events),
        )

    except ValueError as e:
        error_msg = str(e)
        print(f"ValueError generating timeline notes: {error_msg}")
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        error_msg = str(e)
        print(f"Error generating timeline notes: {type(e).__name__}: {error_msg}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"生成时间笔记失败: {error_msg}")


@router.post("/documents/{doc_id}/ai-generate-timeline-notes-stream")
async def ai_generate_timeline_notes_stream(
    doc_id: str,
    request: AIGenerateTimelineNotesRequest = None,
    db: Session = Depends(get_db),
):
    """
    流式生成时间笔记
    使用Server-Sent Events (SSE)实时返回生成的内容
    """
    import traceback

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    content_to_process = (
        request.content if request and request.content else doc.original_content
    )
    if not content_to_process:
        raise HTTPException(status_code=400, detail="文档没有内容")

    print(f"[ai_generate_timeline_notes_stream] Processing document: {doc.title}")

    async def event_generator():
        full_content = ""
        try:
            async for chunk in ai_service.generate_timeline_notes_stream(
                content=content_to_process,
                custom_prompt=request.custom_prompt if request else None,
            ):
                full_content += chunk
                data = json.dumps({"content": chunk, "done": False}, ensure_ascii=False)
                yield f"data: {data}\n\n"

            parsed_events = parse_timeline_notes_output(full_content)

            print(
                f"[ai_generate_timeline_notes_stream] Parsed {len(parsed_events)} events"
            )
            data = json.dumps(
                {
                    "content": "",
                    "done": True,
                    "full_content": full_content,
                    "parsed_events": [e.model_dump() for e in parsed_events],
                    "total_events": len(parsed_events),
                },
                ensure_ascii=False,
            )
            yield f"data: {data}\n\n"

        except ValueError as e:
            error_msg = str(e)
            print(f"ValueError in stream: {error_msg}")
            traceback.print_exc()
            data = json.dumps({"error": error_msg, "done": True}, ensure_ascii=False)
            yield f"data: {data}\n\n"
        except Exception as e:
            error_msg = str(e)
            print(f"Error in stream: {type(e).__name__}: {error_msg}")
            traceback.print_exc()
            data = json.dumps({"error": error_msg, "done": True}, ensure_ascii=False)
            yield f"data: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/documents/{doc_id}/save-timeline-notes-batch")
async def save_timeline_notes_batch(
    doc_id: str, request: SaveTimelineNotesBatchRequest, db: Session = Depends(get_db)
):
    """
    批量保存AI生成的时间笔记到数据库
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    saved_events = []
    for event_data in request.events:
        event_tags = event_data.tags if event_data.tags else request.default_tags

        event = DocumentTimelineEvent(
            document_id=doc_id,
            event_date=event_data.event_date,
            event_date_display=event_data.event_date_display,
            event_title=event_data.event_title,
            event_description=event_data.event_description,
            importance="normal",
            tags=event_tags,
            ai_generated=1,
            formatted_content=f"[{event_data.event_date}/{event_data.event_title}/{event_data.event_description}]",
        )
        db.add(event)
        saved_events.append(event)

    db.commit()

    return {
        "success": True,
        "saved_count": len(saved_events),
        "events": [
            {
                "id": e.id,
                "event_date": e.event_date,
                "event_date_display": e.event_date_display,
                "event_title": e.event_title,
                "event_description": e.event_description,
            }
            for e in saved_events
        ],
    }


@router.get("/documents/incomplete-generations")
def get_incomplete_generations(min_length: int = 100, db: Session = Depends(get_db)):
    """
    查找生成不完整的文档

    判断条件：
    1. framework_content 为空
    2. framework_content 长度过短（小于 min_length）
    3. framework_content 看起来被截断（不以句号、感叹号、问号结尾）
    """
    documents = (
        db.query(Document)
        .filter(Document.original_content != None, Document.original_content != "")
        .all()
    )

    incomplete_docs = []

    for doc in documents:
        issues = []

        if not doc.framework_content:
            issues.append("未生成正文")
        elif len(doc.framework_content) < min_length:
            issues.append(f"正文过短（{len(doc.framework_content)}字符）")
        elif doc.framework_content and not doc.framework_content.strip().endswith(
            ("。", "！", "？", ".", "!", "?", "」", "』", '"', "'")
        ):
            issues.append("正文可能被截断（未正常结束）")

        if issues:
            incomplete_docs.append(
                {
                    "id": doc.id,
                    "title": doc.title,
                    "original_content_length": len(doc.original_content)
                    if doc.original_content
                    else 0,
                    "framework_content_length": len(doc.framework_content)
                    if doc.framework_content
                    else 0,
                    "issues": issues,
                    "created_at": doc.created_at.isoformat()
                    if doc.created_at
                    else None,
                    "updated_at": doc.updated_at.isoformat()
                    if doc.updated_at
                    else None,
                }
            )

    return {
        "total": len(incomplete_docs),
        "min_length_threshold": min_length,
        "documents": incomplete_docs,
    }


@router.post("/documents/batch-regenerate")
async def batch_regenerate_content(request: dict, db: Session = Depends(get_db)):
    """
    批量重新生成文档正文（强制重新生成）

    与 batch_generate_content 不同，此接口会强制重新生成，即使已有正文
    """
    from app.config import settings_manager
    import asyncio
    import traceback

    document_ids = request.get("document_ids", [])
    force_regenerate = request.get("force_regenerate", True)

    if not document_ids:
        return {"success": False, "message": "No document IDs provided"}

    prompt_template = settings_manager.framework_prompt
    results = []

    print(
        f"[batch_regenerate] Starting batch regeneration for {len(document_ids)} documents"
    )
    print(f"[batch_regenerate] Force regenerate: {force_regenerate}")

    for i, doc_id in enumerate(document_ids):
        doc = None
        try:
            if i > 0:
                await asyncio.sleep(2)

            doc = db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                results.append(
                    {
                        "id": doc_id,
                        "success": False,
                        "error": "文档不存在",
                        "error_type": "not_found",
                    }
                )
                continue

            if not doc.original_content:
                results.append(
                    {
                        "id": doc_id,
                        "success": False,
                        "error": "文档没有原文内容",
                        "error_type": "no_content",
                        "title": doc.title,
                    }
                )
                continue

            if doc.framework_content and not force_regenerate:
                print(
                    f"[batch_regenerate] Document {doc.title} already has framework_content, skipping"
                )
                results.append(
                    {
                        "id": doc_id,
                        "success": True,
                        "title": doc.title,
                        "skipped": True,
                        "message": "已有正文内容，跳过生成",
                    }
                )
                continue

            old_length = len(doc.framework_content) if doc.framework_content else 0
            content_to_process = doc.original_content[:15000]
            print(
                f"[batch_regenerate] Processing document {i + 1}/{len(document_ids)}: {doc.title}"
            )
            print(
                f"[batch_regenerate] Content length: {len(content_to_process)}, Old framework length: {old_length}"
            )

            prompt = prompt_template.replace("{content}", content_to_process)

            generated_content = await ai_service.generate_text(
                prompt,
                system_prompt="你是一个专业的中文编辑，擅长将口语化内容转化为高质量的书面文章。",
            )

            doc.framework_content = generated_content
            db.commit()

            results.append(
                {
                    "id": doc_id,
                    "success": True,
                    "title": doc.title,
                    "old_length": old_length,
                    "new_length": len(generated_content),
                }
            )

            print(
                f"[batch_regenerate] Successfully regenerated content for: {doc.title} ({old_length} -> {len(generated_content)} chars)"
            )

        except ValueError as e:
            error_msg = str(e)
            print(f"ValueError for document {doc_id}: {error_msg}")
            traceback.print_exc()

            error_type = "api_error"
            if "api key" in error_msg.lower() or "authentication" in error_msg.lower():
                error_type = "auth_error"
            elif "model" in error_msg.lower() and "not found" in error_msg.lower():
                error_type = "model_error"
            elif "context" in error_msg.lower() and "length" in error_msg.lower():
                error_type = "context_too_long"

            results.append(
                {
                    "id": doc_id,
                    "success": False,
                    "error": error_msg,
                    "error_type": error_type,
                    "title": doc.title if doc else None,
                }
            )
        except asyncio.TimeoutError:
            error_msg = "请求超时"
            print(f"Timeout for document {doc_id}")
            results.append(
                {
                    "id": doc_id,
                    "success": False,
                    "error": error_msg,
                    "error_type": "timeout",
                    "title": doc.title if doc else None,
                }
            )
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            print(
                f"Error regenerating content for document {doc_id}: {error_type}: {error_msg}"
            )
            traceback.print_exc()

            classified_error_type = "unknown_error"
            if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                classified_error_type = "timeout"
                error_msg = "请求超时，请稍后重试"
            elif (
                "api key" in error_msg.lower() or "authentication" in error_msg.lower()
            ):
                classified_error_type = "auth_error"
                error_msg = "API认证失败，请检查API Key设置"
            elif "model" in error_msg.lower() and "not found" in error_msg.lower():
                classified_error_type = "model_error"
                error_msg = "模型不存在，请检查模型名称设置"
            elif "context" in error_msg.lower() and "length" in error_msg.lower():
                classified_error_type = "context_too_long"
                error_msg = "内容过长，超出模型上下文限制"
            elif (
                "rate limit" in error_msg.lower()
                or "too many requests" in error_msg.lower()
            ):
                classified_error_type = "rate_limit"
                error_msg = "API请求频率限制，请稍后重试"
            elif "connection" in error_msg.lower() or "network" in error_msg.lower():
                classified_error_type = "network_error"
                error_msg = "网络连接失败，请检查网络"

            results.append(
                {
                    "id": doc_id,
                    "success": False,
                    "error": error_msg,
                    "error_type": classified_error_type,
                    "title": doc.title if doc else None,
                }
            )

    return {
        "success": True,
        "results": results,
        "total": len(document_ids),
        "completed": sum(1 for r in results if r.get("success")),
        "failed": sum(1 for r in results if not r.get("success")),
    }
