import sqlite3

conn = sqlite3.connect('interactive_docs.db')
cursor = conn.cursor()

print('=== 检查 book_documents 表中的 docx 文件是否也存在于 documents 表 ===')
cursor.execute('''
    SELECT id, title, file_path 
    FROM book_documents 
    WHERE file_path LIKE '%.docx'
''')
books_with_docx = cursor.fetchall()
print(f'book_documents 表中共有 {len(books_with_docx)} 个 docx 文件')

print()
print('=== 检查这些标题是否在 documents 表中也存在 ===')
for book in books_with_docx[:5]:
    book_id, book_title, book_path = book
    cursor.execute('SELECT id, title FROM documents WHERE title = ?', (book_title,))
    doc_match = cursor.fetchone()
    if doc_match:
        print(f'  ✓ "{book_title}" 在两个表都存在')
        print(f'    book_documents ID: {book_id[:8]}...')
        print(f'    documents ID: {doc_match[0][:8]}...')
    else:
        print(f'  ✗ "{book_title}" 只在 book_documents 表中')

print()
print('=== 统计重复情况 ===')
duplicate_count = 0
only_in_books = 0
for book in books_with_docx:
    book_title = book[1]
    cursor.execute('SELECT id FROM documents WHERE title = ?', (book_title,))
    if cursor.fetchone():
        duplicate_count += 1
    else:
        only_in_books += 1

print(f'在两个表都存在的: {duplicate_count} 条')
print(f'只在 book_documents 表的: {only_in_books} 条')

conn.close()
