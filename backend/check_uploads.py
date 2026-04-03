"""
检查uploads目录中的PDF文件
"""
import os
import sqlite3

# 检查uploads/books目录
books_dir = 'uploads/books'
if os.path.exists(books_dir):
    files = [f for f in os.listdir(books_dir) if f.endswith('.pdf')]
    print(f'=== Uploads目录中的PDF文件 ===\n')
    print(f'找到 {len(files)} 个PDF文件:\n')
    
    for i, f in enumerate(files[:10], 1):
        file_path = os.path.join(books_dir, f)
        file_size = os.path.getsize(file_path)
        print(f'{i}. {f}')
        print(f'   大小: {file_size / 1024:.1f} KB')
        print(f'   完整路径: {file_path}')
        print()
else:
    print(f'目录 {books_dir} 不存在')

# 检查数据库中是否有对应的记录
conn = sqlite3.connect('interactive_docs.db')
cursor = conn.cursor()

cursor.execute('SELECT COUNT(*) FROM book_documents')
book_count = cursor.fetchone()[0]

cursor.execute('SELECT COUNT(*) FROM documents')
doc_count = cursor.fetchone()[0]

print(f'\n=== 数据库统计 ===')
print(f'书籍记录: {book_count}')
print(f'文档记录: {doc_count}')

conn.close()
