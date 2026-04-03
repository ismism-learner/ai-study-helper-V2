from app.database import SessionLocal
from app.models import BookDocument

db = SessionLocal()
books = db.query(BookDocument).limit(3).all()

for b in books:
    print(f'ID: {b.id[:8]}')
    print(f'  Title: {b.title[:50]}')
    print(f'  Author: {b.author}')
    if b.cover_image:
        print(f'  Cover prefix: {b.cover_image[:100]}...')
        print(f'  Cover total length: {len(b.cover_image)}')
    else:
        print(f'  Cover: None')
    print()

db.close()
