"""
批量更新文档标题，去除路径信息，只保留纯文件名

使用方法：
cd backend
python scripts/update_document_titles.py
"""

import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import Document


def update_document_titles():
    """批量更新文档标题，去除路径信息"""
    db = SessionLocal()
    
    try:
        # 获取所有文档
        documents = db.query(Document).all()
        
        updated_count = 0
        
        for doc in documents:
            old_title = doc.title
            
            # 检查标题是否包含路径分隔符
            if '/' in old_title or '\\' in old_title:
                # 提取纯文件名
                # 处理正斜杠和反斜杠
                pure_name = old_title.replace('\\', '/').split('/')[-1]
                
                # 更新标题
                doc.title = pure_name
                updated_count += 1
                
                print(f"更新: '{old_title}' -> '{pure_name}'")
        
        if updated_count > 0:
            db.commit()
            print(f"\n成功更新 {updated_count} 个文档标题")
        else:
            print("没有需要更新的文档标题")
    
    except Exception as e:
        db.rollback()
        print(f"更新失败: {e}")
        raise
    
    finally:
        db.close()


if __name__ == "__main__":
    print("开始批量更新文档标题...")
    print("=" * 50)
    update_document_titles()
    print("=" * 50)
    print("更新完成！")
