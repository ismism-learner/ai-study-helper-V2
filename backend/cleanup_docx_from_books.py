import sqlite3
import shutil
from datetime import datetime

conn = sqlite3.connect('interactive_docs.db')
cursor = conn.cursor()

print('=== 开始清理 book_documents 表中的 docx 记录 ===')

cursor.execute('''
    SELECT id, title, file_path, author, tags, created_at
    FROM book_documents 
    WHERE file_path LIKE '%.docx' 
       OR file_path LIKE '%.doc'
       OR file_path LIKE '%.txt'
       OR file_path LIKE '%.md'
''')
docx_books = cursor.fetchall()
print(f'找到 {len(docx_books)} 条 docx 记录')

migrated_count = 0
skipped_count = 0

for book in docx_books:
    book_id, title, file_path, author, tags, created_at = book
    
    cursor.execute('SELECT id FROM documents WHERE title = ?', (title,))
    existing = cursor.fetchone()
    
    if not existing:
        cursor.execute('''
            INSERT INTO documents (title, file_path, author, tags, doc_type, archive_status, created_at, updated_at, original_content)
            VALUES (?, ?, ?, ?, 'text_document', 'unarchived_doc', ?, ?, '')
        ''', (title, file_path, author, tags, created_at, datetime.utcnow()))
        migrated_count += 1
    else:
        skipped_count += 1

conn.commit()
print(f'迁移了 {migrated_count} 条新记录到 documents 表')
print(f'跳过了 {skipped_count} 条已存在的记录')

print()
print('=== 删除 book_documents 表中的 docx 记录 ===')
cursor.execute('''
    DELETE FROM book_documents 
    WHERE file_path LIKE '%.docx' 
       OR file_path LIKE '%.doc'
       OR file_path LIKE '%.txt'
       OR file_path LIKE '%.md'
''')
deleted_count = cursor.rowcount
conn.commit()
print(f'从 book_documents 表删除了 {deleted_count} 条记录')

print()
print('=== 清理完成 ===')
cursor.execute('SELECT COUNT(*) FROM book_documents WHERE file_path LIKE "%.docx" OR file_path LIKE "%.doc" OR file_path LIKE "%.txt" OR file_path LIKE "%.md"')
remaining = cursor.fetchone()[0]
print(f'book_documents 表中剩余的 docx/doc/txt/md 记录: {remaining} 条')

cursor.execute('SELECT COUNT(*) FROM book_documents')
total_books = cursor.fetchone()[0]
print(f'book_documents 表中剩余的书籍总数: {total_books} 条')

cursor.execute('SELECT COUNT(*) FROM documents')
total_docs = cursor.fetchone()[0]
print(f'documents 表中的文档总数: {total_docs} 条')

conn.close()
print()
print('清理完成！')
