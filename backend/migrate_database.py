"""
数据库迁移脚本 - 创建缺失的表
"""
from app.database import engine, Base
from app.models import (
    Folder, Document, Highlight, Country, Category, TimePeriod,
    BookDocument, BookTimePeriod, WorldTimelineEvent, DocumentTimelineEvent
)

def migrate_database():
    print("开始数据库迁移...")
    
    # 创建所有表（如果不存在）
    Base.metadata.create_all(bind=engine)
    
    print("数据库迁移完成！")
    
    # 验证表是否创建成功
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    print("\n当前数据库表:")
    for table in sorted(tables):
        print(f"  ✓ {table}")

if __name__ == "__main__":
    migrate_database()
