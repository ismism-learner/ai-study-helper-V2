import sqlite3

conn = sqlite3.connect('interactive_docs.db')
cursor = conn.cursor()

print('=== book_documents 表中的 doc/docx/txt 文件 ===')
cursor.execute('''
    SELECT id, title, file_path 
    FROM book_documents 
    WHERE file_path LIKE '%.doc' 
       OR file_path LIKE '%.docx' 
       OR file_path LIKE '%.txt'
       OR file_path LIKE '%.md'
''')
books_with_doc = cursor.fetchall()
print(f'找到 {len(books_with_doc)} 条记录:')
for b in books_with_doc:
    print(f'  ID: {b[0][:8]}... | 标题: {b[1]} | 路径: {b[2]}')

print()
print('=== documents 表统计 ===')
cursor.execute('SELECT COUNT(*) FROM documents')
doc_count = cursor.fetchone()[0]
print(f'documents 表共有 {doc_count} 条记录')

print()
print('=== documents 表中的文件类型 ===')
cursor.execute('''
    SELECT doc_type, COUNT(*) as cnt 
    FROM documents 
    GROUP BY doc_type
''')
for row in cursor.fetchall():
    print(f'  {row[0]}: {row[1]} 条')

conn.close()
