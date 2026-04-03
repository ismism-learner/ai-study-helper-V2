"""
检查文档内容
"""
import sqlite3

conn = sqlite3.connect('app.db')
cursor = conn.cursor()

print('=== 检查文档内容 ===\n')

# 检查所有文档
cursor.execute('''
    SELECT 
        id, 
        title, 
        doc_type, 
        file_path,
        LENGTH(original_content) as content_length,
        archive_status
    FROM documents
    ORDER BY created_at DESC
    LIMIT 10
''')

docs = cursor.fetchall()
print(f'找到 {len(docs)} 个文档:\n')

for doc in docs:
    doc_id, title, doc_type, file_path, content_length, archive_status = doc
    print(f'文档: {title}')
    print(f'  类型: {doc_type}')
    print(f'  状态: {archive_status}')
    print(f'  文件路径: {file_path}')
    print(f'  内容长度: {content_length or 0} 字符')
    
    # 如果内容为空但文件路径存在
    if content_length == 0 and file_path:
        print(f'  ⚠️  警告: 有文件路径但内容为空!')
    
    print()

# 检查书籍文档
print('\n=== 检查书籍文档 ===\n')
cursor.execute('''
    SELECT 
        id, 
        title, 
        file_path,
        LENGTH(description) as desc_length
    FROM book_documents
    LIMIT 5
''')

books = cursor.fetchall()
print(f'找到 {len(books)} 个书籍:\n')

for book in books:
    book_id, title, file_path, desc_length = book
    print(f'书籍: {title}')
    print(f'  文件路径: {file_path}')
    print()

conn.close()
