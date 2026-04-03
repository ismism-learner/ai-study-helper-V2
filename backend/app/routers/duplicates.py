from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
import uuid
import os

from app.database import get_db
from app.models import BookDocument
from app.services.duplicate_detector import duplicate_detector, DuplicateCheckResult

router = APIRouter()


class DuplicateCheckRequest(BaseModel):
    file_path: str
    title: str
    author: Optional[str] = None
    skip_hash: Optional[bool] = False


class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    duplicate_type: str
    existing_book_id: Optional[str] = None
    existing_book_title: Optional[str] = None
    similarity_score: float
    details: Dict


class DuplicateGroupResponse(BaseModel):
    group_id: str
    books: List[Dict]
    primary_book_id: str


class DuplicateScanResult(BaseModel):
    total_scanned: int
    exact_duplicates: int
    content_duplicates: int
    metadata_duplicates: int
    duplicate_groups: List[DuplicateGroupResponse]


@router.post("/check", response_model=DuplicateCheckResponse)
def check_duplicate(
    request: DuplicateCheckRequest,
    db: Session = Depends(get_db)
):
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=400, detail="File not found")
    
    result = check_book_duplicate(
        file_path=request.file_path,
        title=request.title,
        author=request.author,
        db=db,
        skip_hash=request.skip_hash
    )
    
    return DuplicateCheckResponse(
        is_duplicate=result.is_duplicate,
        duplicate_type=result.duplicate_type,
        existing_book_id=result.existing_book_id,
        existing_book_title=result.existing_book_title,
        similarity_score=result.similarity_score,
        details=result.details
    )


def check_book_duplicate(
    file_path: str,
    title: str,
    author: Optional[str] = None,
    db: Session = None,
    skip_hash: bool = False
) -> DuplicateCheckResult:
    file_hash = None
    content_hash = None
    page_count = None
    
    if not skip_hash:
        try:
            file_hash = duplicate_detector.calculate_file_hash(file_path)
            
            existing_by_hash = db.query(BookDocument).filter(
                BookDocument.file_hash_sha256 == file_hash
            ).first()
            
            if existing_by_hash:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    duplicate_type='exact',
                    existing_book_id=existing_by_hash.id,
                    existing_book_title=existing_by_hash.title,
                    similarity_score=1.0,
                    details={
                        'match_type': 'file_hash',
                        'file_hash': file_hash
                    }
                )
        except Exception as e:
            print(f"Error calculating file hash: {e}")
        
        try:
            content_hash, text_length = duplicate_detector.calculate_content_hash(file_path)
            page_count = duplicate_detector.get_page_count(file_path)
            
            existing_by_content = db.query(BookDocument).filter(
                BookDocument.content_hash_simhash == content_hash
            ).first()
            
            if existing_by_content:
                return DuplicateCheckResult(
                    is_duplicate=True,
                    duplicate_type='content',
                    existing_book_id=existing_by_content.id,
                    existing_book_title=existing_by_content.title,
                    similarity_score=0.95,
                    details={
                        'match_type': 'content_hash',
                        'content_hash': content_hash,
                        'page_count': page_count
                    }
                )
        except Exception as e:
            print(f"Error calculating content hash: {e}")
    
    all_books = db.query(BookDocument).all()
    
    best_match = None
    best_score = 0.0
    
    for book in all_books:
        comparison = duplicate_detector.compare_metadata(
            title1=title,
            title2=book.title,
            author1=author,
            author2=book.author,
            page_count1=page_count,
            page_count2=book.page_count
        )
        
        if comparison['overall_score'] > best_score:
            best_score = comparison['overall_score']
            best_match = book
            best_details = comparison
    
    if best_match and best_score >= 0.7:
        duplicate_type = 'metadata_strong' if best_score >= 0.85 else 'metadata_weak'
        
        return DuplicateCheckResult(
            is_duplicate=True,
            duplicate_type=duplicate_type,
            existing_book_id=best_match.id,
            existing_book_title=best_match.title,
            similarity_score=best_score,
            details={
                'match_type': 'metadata',
                'title_match': best_details.get('title_match', False),
                'title_similarity': best_details.get('title_similarity', 0),
                'author_match': best_details.get('author_match', False),
                'page_count_match': best_details.get('page_count_match', False)
            }
        )
    
    return DuplicateCheckResult(
        is_duplicate=False,
        duplicate_type='none',
        similarity_score=0.0,
        details={
            'file_hash': file_hash,
            'content_hash': content_hash,
            'page_count': page_count
        }
    )


@router.post("/scan", response_model=DuplicateScanResult)
def scan_duplicates(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    books = db.query(BookDocument).all()
    
    hash_groups: Dict[str, List[BookDocument]] = {}
    content_hash_groups: Dict[str, List[BookDocument]] = {}
    metadata_groups: Dict[str, List[BookDocument]] = {}
    
    for book in books:
        if book.file_hash_sha256:
            if book.file_hash_sha256 not in hash_groups:
                hash_groups[book.file_hash_sha256] = []
            hash_groups[book.file_hash_sha256].append(book)
        
        if book.content_hash_simhash:
            if book.content_hash_simhash not in content_hash_groups:
                content_hash_groups[book.content_hash_simhash] = []
            content_hash_groups[book.content_hash_simhash].append(book)
    
    duplicate_groups = []
    processed_ids = set()
    
    for file_hash, group_books in hash_groups.items():
        if len(group_books) > 1:
            group_id = str(uuid.uuid4())
            primary = group_books[0]
            
            for book in group_books:
                if book.id not in processed_ids:
                    book.duplicate_group_id = group_id
                    book.duplicate_status = 'duplicate'
                    book.is_primary = 0
                    processed_ids.add(book.id)
            
            primary.is_primary = 1
            primary.duplicate_status = 'primary'
            
            duplicate_groups.append(DuplicateGroupResponse(
                group_id=group_id,
                books=[{
                    'id': b.id,
                    'title': b.title,
                    'author': b.author,
                    'file_path': b.file_path,
                    'is_primary': b.is_primary
                } for b in group_books],
                primary_book_id=primary.id
            ))
    
    db.commit()
    
    exact_count = sum(len(g) for g in hash_groups.values() if len(g) > 1)
    content_count = sum(len(g) for g in content_hash_groups.values() if len(g) > 1)
    
    return DuplicateScanResult(
        total_scanned=len(books),
        exact_duplicates=exact_count,
        content_duplicates=content_count,
        metadata_duplicates=0,
        duplicate_groups=duplicate_groups
    )


@router.post("/compute-hashes")
def compute_hashes_for_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    books = db.query(BookDocument).filter(
        BookDocument.file_hash_sha256 == None
    ).all()
    
    results = {
        'total': len(books),
        'processed': 0,
        'errors': []
    }
    
    for book in books:
        try:
            if not book.file_path or not os.path.exists(book.file_path):
                results['errors'].append({
                    'book_id': book.id,
                    'title': book.title,
                    'error': 'File not found'
                })
                continue
            
            file_hash = duplicate_detector.calculate_file_hash(book.file_path)
            content_hash, _ = duplicate_detector.calculate_content_hash(book.file_path)
            page_count = duplicate_detector.get_page_count(book.file_path)
            
            book.file_hash_sha256 = file_hash
            book.content_hash_simhash = content_hash
            book.page_count = page_count
            
            results['processed'] += 1
            
        except Exception as e:
            results['errors'].append({
                'book_id': book.id,
                'title': book.title,
                'error': str(e)
            })
    
    db.commit()
    
    return results


@router.get("/groups")
def get_duplicate_groups(db: Session = Depends(get_db)):
    groups = db.query(BookDocument).filter(
        BookDocument.duplicate_group_id != None
    ).all()
    
    grouped_books: Dict[str, List[Dict]] = {}
    
    for book in groups:
        if book.duplicate_group_id not in grouped_books:
            grouped_books[book.duplicate_group_id] = []
        
        grouped_books[book.duplicate_group_id].append({
            'id': book.id,
            'title': book.title,
            'author': book.author,
            'file_path': book.file_path,
            'file_size': book.file_size,
            'is_primary': book.is_primary,
            'duplicate_status': book.duplicate_status
        })
    
    return {
        'groups': [
            {
                'group_id': group_id,
                'books': books,
                'primary_book_id': next((b['id'] for b in books if b['is_primary'] == 1), books[0]['id'] if books else None)
            }
            for group_id, books in grouped_books.items()
        ]
    }


@router.post("/resolve")
def resolve_duplicate(
    primary_book_id: str,
    duplicate_book_ids: List[str],
    action: str = 'keep_primary',
    db: Session = Depends(get_db)
):
    primary = db.query(BookDocument).filter(BookDocument.id == primary_book_id).first()
    if not primary:
        raise HTTPException(status_code=404, detail="Primary book not found")
    
    primary.is_primary = 1
    primary.duplicate_status = 'primary'
    
    for book_id in duplicate_book_ids:
        book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
        if book:
            book.is_primary = 0
            book.duplicate_status = 'duplicate'
            book.duplicate_group_id = primary.duplicate_group_id or str(uuid.uuid4())
            
            if action == 'delete_duplicates':
                if book.file_path and os.path.exists(book.file_path):
                    try:
                        os.remove(book.file_path)
                    except:
                        pass
                db.delete(book)
    
    primary.duplicate_group_id = primary.duplicate_group_id or str(uuid.uuid4())
    
    db.commit()
    
    return {
        'success': True,
        'message': f"Resolved {len(duplicate_book_ids)} duplicates",
        'primary_book_id': primary_book_id
    }


@router.delete("/book/{book_id}")
def delete_duplicate_book(
    book_id: str,
    delete_file: bool = False,
    db: Session = Depends(get_db)
):
    book = db.query(BookDocument).filter(BookDocument.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    if delete_file and book.file_path and os.path.exists(book.file_path):
        try:
            os.remove(book.file_path)
        except Exception as e:
            print(f"Error deleting file: {e}")
    
    db.delete(book)
    db.commit()
    
    return {'success': True, 'message': 'Book deleted'}
