from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text('PRAGMA table_info(book_documents)'))
    columns = [row[1] for row in result.fetchall()]
    print('Existing columns:', columns)
    
    if 'original_filename' not in columns:
        print('Adding original_filename column...')
        conn.execute(text('ALTER TABLE book_documents ADD COLUMN original_filename VARCHAR'))
        conn.commit()
        print('Column added successfully')
    else:
        print('original_filename column already exists')
    
    result = conn.execute(text('PRAGMA table_info(book_documents)'))
    columns = [row[1] for row in result.fetchall()]
    print('Updated columns:', columns)
