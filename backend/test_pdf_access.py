"""
测试PDF文件访问
"""
import requests
import os

# 获取第一本书的信息
r = requests.get('http://127.0.0.1:8000/api/library/books')
books = r.json()

if books:
    book = books[0]
    book_id = book['id']
    title = book['title']
    file_path = book['file_path']
    
    print(f'测试书籍: {title}')
    print(f'Book ID: {book_id}')
    print(f'文件路径: {file_path}')
    
    # 测试获取书籍详情
    r = requests.get(f'http://127.0.0.1:8000/api/library/books/{book_id}')
    if r.status_code == 200:
        book_detail = r.json()
        print(f'\n书籍详情:')
        print(f'  标题: {book_detail["title"]}')
        print(f'  文件路径: {book_detail["file_path"]}')
        print(f'  文件大小: {book_detail.get("file_size", "N/A")} bytes')
    else:
        print(f'获取书籍详情失败: {r.status_code}')
    
    # 测试PDF文件访问
    # 构建PDF URL
    if file_path:
        # 标准化路径
        normalized_path = file_path.replace('\\', '/')
        if normalized_path.startswith('uploads/'):
            pdf_url = f'http://127.0.0.1:8000/{normalized_path}'
        else:
            pdf_url = f'http://127.0.0.1:8000/uploads/books/{os.path.basename(file_path)}'
        
        print(f'\n测试PDF访问:')
        print(f'  URL: {pdf_url}')
        
        try:
            r = requests.head(pdf_url)
            print(f'  状态码: {r.status_code}')
            if r.status_code == 200:
                print(f'  ✓ PDF文件可以访问!')
                print(f'  Content-Type: {r.headers.get("Content-Type", "N/A")}')
                print(f'  Content-Length: {r.headers.get("Content-Length", "N/A")} bytes')
            else:
                print(f'  ✗ PDF文件无法访问')
        except Exception as e:
            print(f'  ✗ 访问失败: {e}')
else:
    print('没有找到书籍')
