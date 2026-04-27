from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, Folder

router = APIRouter()


@router.get("/folders", response_model=list[dict])
def list_folders(db: Session = Depends(get_db)):
    folders = db.query(Folder).all()

    doc_counts = dict(
        db.query(Document.folder_id, func.count(Document.id))
        .group_by(Document.folder_id)
        .all()
    )

    return [
        {
            "id": f.id,
            "name": f.name,
            "parent_id": f.parent_id,
            "created_at": f.created_at,
            "updated_at": f.updated_at,
            "document_count": doc_counts.get(f.id, 0),
        }
        for f in folders
    ]


@router.post("/folders", response_model=dict)
def create_folder(folder_data: dict, db: Session = Depends(get_db)):
    folder = Folder(
        name=folder_data.get("name"), parent_id=folder_data.get("parent_id")
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "created_at": folder.created_at,
        "updated_at": folder.updated_at,
        "document_count": 0,
    }


@router.put("/folders/{folder_id}", response_model=dict)
def update_folder(folder_id: str, folder_data: dict, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if "name" in folder_data:
        folder.name = folder_data["name"]
    if "parent_id" in folder_data:
        folder.parent_id = folder_data["parent_id"]

    db.commit()
    db.refresh(folder)
    doc_count = (
        db.query(func.count(Document.id))
        .filter(Document.folder_id == folder.id)
        .scalar()
    )
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "created_at": folder.created_at,
        "updated_at": folder.updated_at,
        "document_count": doc_count,
    }


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: str, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    db.delete(folder)
    db.commit()
    return {"message": "Folder deleted successfully"}
