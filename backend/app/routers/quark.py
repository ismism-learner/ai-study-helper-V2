import os
import re
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BookDocument
from app.services.quark_service import quark_config, quark_service

router = APIRouter()


class QuarkCookieRequest(BaseModel):
    cookie: str


class QuarkConfigResponse(BaseModel):
    has_cookie: bool
    cli_available: bool
    cookie_preview: str | None = None


class QuarkTestResponse(BaseModel):
    success: bool
    message: str
    user_info: dict | None = None


class QuarkUploadRequest(BaseModel):
    book_id: str
    remote_folder: str | None = "/我的电子图书馆"
    create_share: bool | None = True
    share_expire: int | None = 0


class QuarkUploadResponse(BaseModel):
    success: bool
    message: str
    book_id: str
    share_url: str | None = None
    share_password: str | None = None
    file_id: str | None = None


class QuarkUploadByTagRequest(BaseModel):
    tag: str
    secondary_tag: str | None = None
    book_ids: list[str] | None = None
    country_id: str | None = None
    remote_folder: str | None = "/我的电子图书馆"
    share_expire: int | None = 0


class QuarkUploadByTagResponse(BaseModel):
    success: bool
    message: str
    tag: str
    secondary_tag: str | None = None
    folder_path: str
    share_url: str | None = None
    share_password: str | None = None
    uploaded_count: int
    failed_count: int
    skipped_count: int = 0
    results: list[dict]


@router.get("/config", response_model=QuarkConfigResponse)
def get_quark_config():
    has_cookie = quark_config.has_cookie()
    cookie = quark_config.get_cookie()

    cookie_preview = None
    if cookie:
        if len(cookie) > 20:
            cookie_preview = cookie[:10] + "..." + cookie[-10:]
        else:
            cookie_preview = cookie[:5] + "..."

    return QuarkConfigResponse(
        has_cookie=has_cookie,
        cli_available=quark_service.is_available(),
        cookie_preview=cookie_preview,
    )


@router.post("/config/cookie")
def set_quark_cookie(request: QuarkCookieRequest):
    cookie = request.cookie.strip()

    if not cookie:
        raise HTTPException(status_code=400, detail="Cookie cannot be empty")

    if not cookie.startswith("__pus="):
        cookie = f"__pus={cookie}"

    quark_config.set_cookie(cookie)

    return {"success": True, "message": "Cookie saved successfully"}


@router.delete("/config/cookie")
def clear_quark_cookie():
    quark_config.set_cookie("")
    return {"success": True, "message": "Cookie cleared"}


@router.get("/test", response_model=QuarkTestResponse)
def test_quark_connection():
    if not quark_service.is_available():
        return QuarkTestResponse(
            success=False, message="Quake CLI not found. Please download it first."
        )

    if not quark_config.has_cookie():
        return QuarkTestResponse(
            success=False, message="No cookie configured. Please set your cookie first."
        )

    success, message = quark_service.test_connection()

    user_info = None
    if success:
        try:
            import json

            for line in message.split("\n"):
                if line.strip().startswith("{"):
                    user_info = json.loads(line.strip())
                    break
        except Exception:
            pass

    return QuarkTestResponse(
        success=success,
        message="Connection successful" if success else f"Connection failed: {message}",
        user_info=user_info,
    )


@router.post("/upload", response_model=QuarkUploadResponse)
def upload_to_quark(request: QuarkUploadRequest, db: Session = Depends(get_db)):
    book = db.query(BookDocument).filter(BookDocument.id == request.book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if not book.file_path or not os.path.exists(book.file_path):
        raise HTTPException(status_code=400, detail="Book file not found on disk")

    if not quark_service.is_available():
        raise HTTPException(status_code=400, detail="Quake CLI not available")

    if not quark_config.has_cookie():
        raise HTTPException(status_code=400, detail="No cookie configured")

    safe_title = re.sub(r'[<>:"/\\|?*]', "_", book.title)
    remote_path = f"{request.remote_folder}/{safe_title}.pdf".replace("//", "/")

    book.quark_upload_status = "uploading"
    db.commit()

    success, result = quark_service.ensure_remote_folder(request.remote_folder)
    if not success:
        book.quark_upload_status = "failed"
        db.commit()
        return QuarkUploadResponse(
            success=False,
            message=f"Failed to create remote folder: {result}",
            book_id=request.book_id,
        )

    success, result = quark_service.upload_file(book.file_path, remote_path)

    if not success:
        book.quark_upload_status = "failed"
        db.commit()
        return QuarkUploadResponse(
            success=False,
            message=f"Upload failed: {result.get('stderr', 'Unknown error')}",
            book_id=request.book_id,
        )

    file_id = result.get("file_id")
    share_url = None
    share_password = None

    if request.create_share:
        success, share_result = quark_service.create_share_link(
            remote_path, expire_days=request.share_expire
        )
        if success:
            share_url = share_result.get("share_url")
            share_password = share_result.get("password")

    book.quark_file_id = file_id
    book.quark_share_url = share_url
    book.quark_upload_status = "uploaded"
    book.quark_upload_time = datetime.now(UTC)
    db.commit()

    return QuarkUploadResponse(
        success=True,
        message="Upload successful",
        book_id=request.book_id,
        share_url=share_url,
        share_password=share_password,
        file_id=file_id,
    )


@router.post("/upload-by-tag", response_model=QuarkUploadByTagResponse)
def upload_by_tag_to_quark(
    request: QuarkUploadByTagRequest, db: Session = Depends(get_db)
):
    if not quark_service.is_available():
        raise HTTPException(status_code=400, detail="Quake CLI not available")

    if not quark_config.has_cookie():
        raise HTTPException(status_code=400, detail="No cookie configured")

    query = db.query(BookDocument)

    if request.book_ids:
        books = query.filter(BookDocument.id.in_(request.book_ids)).all()
    elif request.country_id:
        books = query.filter(
            BookDocument.tags.contains([request.tag]),
            BookDocument.country_id == request.country_id,
        ).all()
    else:
        books = query.filter(BookDocument.tags.contains([request.tag])).all()

    if not books:
        return QuarkUploadByTagResponse(
            success=False,
            message=f"No books found with tag: {request.tag}",
            tag=request.tag,
            folder_path="",
            share_url=None,
            share_password=None,
            uploaded_count=0,
            failed_count=0,
            results=[],
        )

    tag_folder_name = re.sub(r'[<>:"/\\|?*]', "_", request.tag)

    if request.secondary_tag:
        secondary_folder_name = re.sub(r'[<>:"/\\|?*]', "_", request.secondary_tag)
        folder_path = f"{request.remote_folder}/{tag_folder_name}/{secondary_folder_name}".replace(
            "//", "/"
        )
    else:
        folder_path = f"{request.remote_folder}/{tag_folder_name}".replace("//", "/")

    success, result = quark_service.ensure_remote_folder(folder_path)
    if not success:
        return QuarkUploadByTagResponse(
            success=False,
            message=f"Failed to create folder: {result}",
            tag=request.tag,
            folder_path=folder_path,
            share_url=None,
            share_password=None,
            uploaded_count=0,
            failed_count=len(books),
            results=[],
        )

    results = []
    uploaded_count = 0
    failed_count = 0
    skipped_count = 0

    for book in books:
        if book.quark_upload_status == "uploaded":
            results.append(
                {
                    "book_id": book.id,
                    "book_title": book.title,
                    "success": True,
                    "message": "Already uploaded",
                    "skipped": True,
                }
            )
            skipped_count += 1
            continue

        if not book.file_path or not os.path.exists(book.file_path):
            results.append(
                {
                    "book_id": book.id,
                    "book_title": book.title,
                    "success": False,
                    "message": "Book file not found",
                }
            )
            failed_count += 1
            continue

        safe_title = re.sub(r'[<>:"/\\|?*]', "_", book.title)
        remote_path = f"{folder_path}/{safe_title}.pdf".replace("//", "/")

        book.quark_upload_status = "uploading"
        db.commit()

        success, result = quark_service.upload_file(book.file_path, remote_path)

        if not success:
            book.quark_upload_status = "failed"
            db.commit()
            results.append(
                {
                    "book_id": book.id,
                    "book_title": book.title,
                    "success": False,
                    "message": f"Upload failed: {result.get('stderr', 'Unknown error')}",
                }
            )
            failed_count += 1
            continue

        file_id = result.get("file_id")

        book.quark_file_id = file_id
        book.quark_upload_status = "uploaded"
        book.quark_upload_time = datetime.now(UTC)
        db.commit()

        results.append(
            {
                "book_id": book.id,
                "book_title": book.title,
                "success": True,
                "message": "Upload successful",
                "file_path": remote_path,
            }
        )
        uploaded_count += 1

    share_url = None
    share_password = None

    if uploaded_count > 0:
        success, share_result = quark_service.create_share_link(
            folder_path, expire_days=request.share_expire
        )
        if success:
            share_url = share_result.get("share_url")
            share_password = share_result.get("password")

            for book in books:
                if book.quark_upload_status == "uploaded":
                    book.quark_share_url = share_url
            db.commit()

    return QuarkUploadByTagResponse(
        success=uploaded_count > 0 or skipped_count > 0,
        message=f"Uploaded {uploaded_count} books, skipped {skipped_count} already uploaded books to {folder_path}",
        tag=request.tag,
        secondary_tag=request.secondary_tag,
        folder_path=folder_path,
        share_url=share_url,
        share_password=share_password,
        uploaded_count=uploaded_count,
        failed_count=failed_count,
        skipped_count=skipped_count,
        results=results,
    )


@router.post("/upload-batch")
def upload_batch_to_quark(
    book_ids: list[str],
    remote_folder: str | None = "/我的电子图书馆",
    create_share: bool | None = True,
    share_expire: int | None = 0,
    db: Session = Depends(get_db),
):
    results = []

    for book_id in book_ids:
        book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
        if not book:
            results.append(
                {"book_id": book_id, "success": False, "message": "Book not found"}
            )
            continue

        if not book.file_path or not os.path.exists(book.file_path):
            results.append(
                {"book_id": book_id, "success": False, "message": "Book file not found"}
            )
            continue

        safe_title = re.sub(r'[<>:"/\\|?*]', "_", book.title)
        remote_path = f"{remote_folder}/{safe_title}.pdf".replace("//", "/")

        book.quark_upload_status = "uploading"
        db.commit()

        success, result = quark_service.upload_file(book.file_path, remote_path)

        if not success:
            book.quark_upload_status = "failed"
            db.commit()
            results.append(
                {
                    "book_id": book_id,
                    "success": False,
                    "message": f"Upload failed: {result.get('stderr', 'Unknown error')}",
                }
            )
            continue

        file_id = result.get("file_id")
        share_url = None
        share_password = None

        if create_share:
            success, share_result = quark_service.create_share_link(
                remote_path, expire_days=share_expire
            )
            if success:
                share_url = share_result.get("share_url")
                share_password = share_result.get("password")

        book.quark_file_id = file_id
        book.quark_share_url = share_url
        book.quark_upload_status = "uploaded"
        book.quark_upload_time = datetime.now(UTC)
        db.commit()

        results.append(
            {
                "book_id": book_id,
                "success": True,
                "message": "Upload successful",
                "share_url": share_url,
                "share_password": share_password,
            }
        )

    return {"results": results}


@router.get("/books/{book_id}/status")
def get_book_quark_status(book_id: str, db: Session = Depends(get_db)):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    return {
        "book_id": book_id,
        "upload_status": book.quark_upload_status or "not_uploaded",
        "share_url": book.quark_share_url,
        "file_id": book.quark_file_id,
        "upload_time": book.quark_upload_time.isoformat()
        if book.quark_upload_time
        else None,
    }


@router.post("/books/{book_id}/refresh-share")
def refresh_share_link(
    book_id: str,
    remote_folder: str | None = "/我的电子图书馆",
    expire: int | None = 0,
    db: Session = Depends(get_db),
):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    if not book.quark_file_id:
        raise HTTPException(status_code=400, detail="Book not uploaded to Quark")

    safe_title = re.sub(r'[<>:"/\\|?*]', "_", book.title)
    remote_path = f"{remote_folder}/{safe_title}.pdf".replace("//", "/")

    success, result = quark_service.create_share_link(remote_path, expire_days=expire)

    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create share link: {result.get('stderr', 'Unknown error')}",
        )

    book.quark_share_url = result.get("share_url")
    db.commit()

    return {
        "success": True,
        "share_url": result.get("share_url"),
        "password": result.get("password"),
    }


@router.get("/tags/summary")
def get_tags_summary(country_id: str | None = None, db: Session = Depends(get_db)):
    query = db.query(BookDocument)

    if country_id:
        query = query.filter(BookDocument.country_id == country_id)

    books = query.all()

    tag_stats = {}
    for book in books:
        if book.tags:
            for tag in book.tags:
                if tag not in tag_stats:
                    tag_stats[tag] = {
                        "tag": tag,
                        "total": 0,
                        "uploaded": 0,
                        "not_uploaded": 0,
                        "book_ids": [],
                    }
                tag_stats[tag]["total"] += 1
                tag_stats[tag]["book_ids"].append(book.id)
                if book.quark_upload_status == "uploaded":
                    tag_stats[tag]["uploaded"] += 1
                else:
                    tag_stats[tag]["not_uploaded"] += 1

    tags_list = sorted(tag_stats.values(), key=lambda x: x["total"], reverse=True)

    return {"tags": tags_list}
