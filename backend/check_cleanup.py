import sqlite3

conn = sqlite3.connect('interactive_docs.db')
cursor = conn.cursor()

print('=== 统计需要从 book_documents 表中移除的 docx 记录 ===')
cursor.execute('''
    SELECT COUNT(*) 
    FROM book_documents 
    WHERE file_path LIKE '%.docx' 
       OR file_path LIKE '%.doc'
       OR file_path LIKE '%.txt'
       OR file_path LIKE '%.md'
''')
count = cursor.fetchone()[0]
print(f'共有 {count} 条记录需要从书籍表中移除')

print()
print('=== 这些记录的标题示例（前5条）===')
cursor.execute('''
    SELECT title, file_path 
    FROM book_documents 
    WHERE file_path LIKE '%.docx' 
       OR file_path LIKE '%.doc'
       OR file_path LIKE '%.txt'
       OR file_path LIKE '%.md'
    LIMIT 5
''')
for row in cursor.fetchall():
    print(f'  - {row[0]}')

print()
print('=== 确认这些文件在 documents 表中存在 ===')
cursor.execute('''
    SELECT COUNT(DISTINCT b.title)
    FROM book_documents b
    INNER JOIN documents d ON b.title = d.title
    WHERE b.file_path LIKE '%.docx' 
       OR b.file_path LIKE '%.doc'
       OR b.file_path LIKE '%.txt'
       OR b.file_path LIKE '%.md'
''')
safe_count = cursor.fetchone()[0]
print(f'有 {safe_count} 条在 documents 表中也有对应记录（安全可删除）')

conn.close()
