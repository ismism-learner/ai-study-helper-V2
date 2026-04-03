"""
导入uploads目录中现有的PDF文件到数据库
"""
import os
import sqlite3
from datetime import datetime
import uuid

def generate_uuid():
    return str(uuid.uuid4())

def parse_filename(filename):
    """从文件名解析标题和作者"""
    name = os.path.splitext(filename)[0]
    
    author = None
    title = name
    
    patterns = [
        (r'^(.+?)\s*\((.+?)\)\s*\(Z-Library\)$', lambda m: (m.group(1).strip(), m.group(2).strip())),
        (r'^(.+?)\s*[-–]\s*(.+?)$', lambda m: (m.group(2).strip(), m.group(1).strip())),
        (r'^(.+?)\s*\[(.+?)\]$', lambda m: (m.group(1).strip(), m.group(2).strip())),
        (r'^(.+?)\s*《(.+?)》$', lambda m: (m.group(2).strip(), m.group(1).strip())),
    ]
    
    import re
    for pattern, extractor in patterns:
        match = re.match(pattern, name)
        if match:
            try:
                title, author = extractor(match)
                break
            except:
                continue
    
    if not author:
        author_match = re.search(r'\(([^)]+)\)', name)
        if author_match:
            potential_author = author_match.group(1).strip()
            if len(potential_author) < 20 and not potential_author[0].isdigit():
                author = potential_author
                title = name[:author_match.start()].strip()
    
    return title, author

def import_existing_pdfs():
    books_dir = 'uploads/books'
    if not os.path.exists(books_dir):
        print(f'目录 {books_dir} 不存在')
        return
    
    pdf_files = [f for f in os.listdir(books_dir) if f.endswith('.pdf')]
    print(f'找到 {len(pdf_files)} 个PDF文件')
    
    conn = sqlite3.connect('interactive_docs.db')
    cursor = conn.cursor()
    
    imported_count = 0
    skipped_count = 0
    
    for pdf_file in pdf_files:
        file_path = os.path.join(books_dir, pdf_file)
        
        # 检查是否已存在
        cursor.execute('SELECT id FROM book_documents WHERE file_path = ?', (file_path,))
        if cursor.fetchone():
            skipped_count += 1
            continue
        
        # 解析文件名
        title, author = parse_filename(pdf_file)
        file_size = os.path.getsize(file_path)
        
        # 创建数据库记录
        book_id = generate_uuid()
        now = datetime.utcnow().isoformat()
        
        cursor.execute('''
            INSERT INTO book_documents 
            (id, title, author, file_path, file_size, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (book_id, title, author, file_path, file_size, now, now))
        
        imported_count += 1
        print(f'导入: {title}' + (f' (作者: {author})' if author else ''))
    
    conn.commit()
    conn.close()
    
    print(f'\n导入完成!')
    print(f'  新导入: {imported_count} 个')
    print(f'  已存在: {skipped_count} 个')

if __name__ == '__main__':
    import_existing_pdfs()
