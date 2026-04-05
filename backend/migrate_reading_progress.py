"""
Migration: Add reading progress fields to book_documents
- last_read_page: 当前阅读页码
- last_read_time: 上次阅读时间
- total_reading_seconds: 总阅读秒数
- reading_speed_pages_per_hour: 阅读速度（页/小时）
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'interactive_docs.db')

def migrate():
    print(f"Database path: {DB_PATH}")
    if not os.path.exists(DB_PATH):
        print(f"Database file not found at {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 检查字段是否已存在
    cursor.execute("PRAGMA table_info(book_documents)")
    columns = [col[1] for col in cursor.fetchall()]
    
    new_columns = [
        ('last_read_page', 'INTEGER DEFAULT 1'),
        ('last_read_time', 'DATETIME'),
        ('total_reading_seconds', 'INTEGER DEFAULT 0'),
        ('reading_speed_pages_per_hour', 'REAL'),
    ]
    
    for col_name, col_type in new_columns:
        if col_name not in columns:
            print(f"Adding column: {col_name}")
            cursor.execute(f"ALTER TABLE book_documents ADD COLUMN {col_name} {col_type}")
        else:
            print(f"Column already exists: {col_name}")
    
    conn.commit()
    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
