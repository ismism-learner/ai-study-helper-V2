import os
import sys
import fitz
import io
import base64
from PIL import Image
from app.database import SessionLocal
from app.models import BookDocument

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


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
        print(f"Error extracting metadata from {file_path}: {e}")
    
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
        
        max_size = 800
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        output.seek(0)
        cover_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
        cover_data_url = f"data:image/jpeg;base64,{cover_base64}"
        
        thumbnail_size = 120
        img.thumbnail((thumbnail_size, thumbnail_size), Image.Resampling.LANCZOS)
        output_thumb = io.BytesIO()
        img.save(output_thumb, format='JPEG', quality=60, optimize=True)
        output_thumb.seek(0)
        thumbnail_base64 = base64.b64encode(output_thumb.getvalue()).decode('utf-8')
        thumbnail_data_url = f"data:image/jpeg;base64,{thumbnail_base64}"
        
        doc.close()
        return cover_data_url, thumbnail_data_url
        
    except Exception as e:
        print(f"Failed to generate cover for {file_path}: {e}")
        return None, None


def main():
    db = SessionLocal()
    
    books = db.query(BookDocument).all()
    print(f"Found {len(books)} books to process")
    
    updated_count = 0
    error_count = 0
    
    for i, book in enumerate(books):
        print(f"\n[{i+1}/{len(books)}] Processing: {book.title[:50]}...")
        
        if not book.file_path:
            print("  No file path, skipping")
            continue
        
        full_path = os.path.join(BASE_DIR, book.file_path) if not os.path.isabs(book.file_path) else book.file_path
        
        if not os.path.exists(full_path):
            print(f"  File not found: {full_path}")
            error_count += 1
            continue
        
        needs_update = False
        
        if not book.author or not book.cover_image or not book.thumbnail:
            needs_update = True
        
        if needs_update:
            if not book.author:
                metadata = extract_pdf_metadata(full_path)
                if metadata['author']:
                    book.author = metadata['author']
                    print(f"  Extracted author: {metadata['author']}")
                else:
                    print("  No author found in PDF metadata")
            
            if not book.cover_image or not book.thumbnail:
                cover, thumbnail = generate_pdf_cover(full_path)
                if cover:
                    book.cover_image = cover
                    print(f"  Generated cover image")
                if thumbnail:
                    book.thumbnail = thumbnail
                    print(f"  Generated thumbnail")
            
            db.commit()
            updated_count += 1
        else:
            print("  Already has cover and author, skipping")
    
    db.close()
    print(f"\n\nDone! Updated {updated_count} books, {error_count} errors")


if __name__ == "__main__":
    main()
