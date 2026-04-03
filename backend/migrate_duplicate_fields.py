from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text('PRAGMA table_info(book_documents)'))
    columns = [row[1] for row in result.fetchall()]
    print('Existing columns:', columns)
    
    new_columns = [
        ('file_hash_sha256', 'VARCHAR(64)'),
        ('content_hash_simhash', 'VARCHAR(32)'),
        ('content_hash_murmur', 'VARCHAR(32)'),
        ('page_count', 'INTEGER'),
        ('duplicate_group_id', 'VARCHAR'),
        ('is_primary', 'INTEGER DEFAULT 1'),
        ('duplicate_status', "VARCHAR DEFAULT 'unique'"),
    ]
    
    for col_name, col_type in new_columns:
        if col_name not in columns:
            print(f'Adding column: {col_name}')
            conn.execute(text(f'ALTER TABLE book_documents ADD COLUMN {col_name} {col_type}'))
    
    conn.commit()
    print('Migration completed!')
    
    result = conn.execute(text('PRAGMA table_info(book_documents)'))
    columns = [row[1] for row in result.fetchall()]
    print('Updated columns:', columns)
