import sqlite3
import os

db_path = 'app.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('SELECT name FROM sqlite_master WHERE type="table"')
    tables = cursor.fetchall()
    print('=== 现有表 ===')
    for t in tables:
        print(f'  - {t[0]}')
    
    print('\n=== Documents表结构 ===')
    cursor.execute('PRAGMA table_info(documents)')
    columns = cursor.fetchall()
    for col in columns:
        print(f'  {col[1]}: {col[2]}')
    
    print('\n=== Documents表示例数据 ===')
    cursor.execute('SELECT id, title, doc_type, file_path, original_content IS NOT NULL as has_content FROM documents LIMIT 3')
    docs = cursor.fetchall()
    for doc in docs:
        print(f'  ID: {doc[0][:8]}..., Title: {doc[1]}, Type: {doc[2]}, FilePath: {doc[3]}, HasContent: {doc[4]}')
    
    conn.close()
else:
    print(f'{db_path} not found')
