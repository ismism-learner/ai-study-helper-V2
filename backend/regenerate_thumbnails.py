import os
import sys
import fitz
import io
import base64
import re
from PIL import Image
from app.database import SessionLocal
from app.models import BookDocument

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BOOKS_DIR = os.path.join(BASE_DIR, "uploads", "books")


def find_matching_file(book_title: str, files: list) -> str:
    title_clean = book_title.lower().strip()
    
    for f in files:
        file_clean = f.lower().replace('.pdf', '').strip()
        if title_clean.startswith(file_clean[:30]) or file_clean.startswith(title_clean[:30]):
            return f
    
    title_words = re.findall(r'[\u4e00-\u9fff]+', book_title)
    if title_words:
        main_word = title_words[0]
        for f in files:
            if main_word in f:
                return f
    
    return None


def extract_pdf_metadata(file_path: str) -> dict:
    result = {
        'author': None,
        'title': None,
        'subject': None,
        'keywords': None,
    }
    
    try:
        doc = fitz.open(file_path)
        metadata = doc.metadata
        
        if metadata:
            result['author'] = metadata.get('author') or metadata.get('Author')
            result['title'] = metadata.get('title') or metadata.get('Title')
            result['subject'] = metadata.get('subject') or metadata.get('Subject')
            result['keywords'] = metadata.get('keywords') or metadata.get('Keywords')
        
        doc.close()
    except Exception as e:
        print(f"Error extracting metadata: {e}")
    
    return result


def generate_pdf_cover(file_path: str) -> tuple:
    try:
        doc = fitz.open(file_path)
        if len(doc) == 0:
            return None, None
        
        page = doc[0]
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        
        max_height = 800
        if img.size[1] > max_height:
            ratio = max_height / img.size[1]
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        output.seek(0)
        cover_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
        cover_data_url = f"data:image/jpeg;base64,{cover_base64}"
        
        thumbnail_height = 200
        if img.size[1] > thumbnail_height:
            ratio = thumbnail_height / img.size[1]
            new_thumb_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            thumb_img = img.resize(new_thumb_size, Image.Resampling.LANCZOS)
        else:
            thumb_img = img
        
        output_thumb = io.BytesIO()
        thumb_img.save(output_thumb, format='JPEG', quality=60, optimize=True)
        output_thumb.seek(0)
        thumbnail_base64 = base64.b64encode(output_thumb.getvalue()).decode('utf-8')
        thumbnail_data_url = f"data:image/jpeg;base64,{thumbnail_base64}"
        
        doc.close()
        return cover_data_url, thumbnail_data_url
        
    except Exception as e:
        print(f"Failed to generate cover: {e}")
        return None, None


def main():
    db = SessionLocal()
    
    actual_files = [f for f in os.listdir(BOOKS_DIR) if f.endswith('.pdf')]
    print(f"Found {len(actual_files)} PDF files in uploads/books")
    
    books = db.query(BookDocument).all()
    print(f"Found {len(books)} books in database")
    
    updated_count = 0
    matched_count = 0
    
    for i, book in enumerate(books):
        print(f"\n[{i+1}/{len(books)}] Processing: {book.title[:50]}...")
        
        current_path = os.path.join(BASE_DIR, book.file_path) if book.file_path else None
        
        if current_path and os.path.exists(current_path):
            print(f"  File exists at: {book.file_path}")
            matched_count += 1
        else:
            matching_file = find_matching_file(book.title, actual_files)
            if matching_file:
                new_path = f"uploads/books/{matching_file}"
                book.file_path = new_path
                print(f"  Updated path to: {new_path}")
                matched_count += 1
            else:
                print(f"  No matching file found!")
                continue
        
        full_path = os.path.join(BASE_DIR, book.file_path)
        
        if not os.path.exists(full_path):
            print(f"  File still not found: {full_path}")
            continue
        
        metadata = extract_pdf_metadata(full_path)
        if metadata['author'] and not book.author:
            book.author = metadata['author']
            print(f"  Extracted author: {metadata['author']}")
        
        cover, thumbnail = generate_pdf_cover(full_path)
        if cover:
            book.cover_image = cover
            print(f"  Regenerated cover image (height-based)")
        if thumbnail:
            book.thumbnail = thumbnail
            print(f"  Regenerated thumbnail (height: 200px)")
        
        db.commit()
        updated_count += 1
    
    db.close()
    print(f"\n\nDone! Matched {matched_count}/{len(books)} files, updated {updated_count} books")


if __name__ == "__main__":
    main()
