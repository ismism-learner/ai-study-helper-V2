from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())


class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship("Folder", remote_side=[id], backref="children")
    documents = relationship("Document", back_populates="folder", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    original_content = Column(Text, nullable=False)
    framework_content = Column(Text, nullable=True)
    processed_content = Column(Text, nullable=True)
    generated_content = Column(Text, nullable=True)
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True)
    
    # 文档分类状态: unarchived_book, archived_book, unarchived_doc, archived_doc
    archive_status = Column(String, default="unarchived_doc")
    # 文档类型: pdf_ebook, text_document
    doc_type = Column(String, default="text_document")
    # 标签
    tags = Column(JSON, nullable=True)
    # 作者
    author = Column(String, nullable=True)
    # 描述
    description = Column(Text, nullable=True)
    # 文件路径（如果是上传的文件）
    file_path = Column(String, nullable=True)
    # 关联的书籍ID（如果是从书籍提取的文档）
    source_book_id = Column(String, ForeignKey("book_documents.id"), nullable=True)
    # 文档链接（外部链接）
    external_link = Column(String, nullable=True)
    
    # 内容发生地（国家ID，关联到地图国家）
    content_country_id = Column(String, ForeignKey("countries.id"), nullable=True)
    # 内容发生时间 - 起始年份
    content_year_start = Column(Integer, nullable=True)
    # 内容发生时间 - 结束年份
    content_year_end = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    highlights = relationship("Highlight", back_populates="document", cascade="all, delete-orphan")
    folder = relationship("Folder", back_populates="documents")
    source_book = relationship("BookDocument", foreign_keys=[source_book_id])
    timeline_events = relationship("DocumentTimelineEvent", back_populates="document", cascade="all, delete-orphan")


class Highlight(Base):
    __tablename__ = "highlights"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    highlighted_text = Column(Text, nullable=False)
    start_offset = Column(Integer, nullable=False)
    end_offset = Column(Integer, nullable=False)
    highlight_type = Column(String, default="explanation")
    explanation = Column(Text, nullable=True)
    prompt_template = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document", back_populates="highlights")


class Country(Base):
    __tablename__ = "countries"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    code = Column(String(10), nullable=False, unique=True)
    region = Column(String, nullable=True)
    continent = Column(String, nullable=True)
    geojson_properties = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    books = relationship("BookDocument", back_populates="country", foreign_keys="BookDocument.country_id", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("categories.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship("Category", remote_side=[id], backref="children")
    books = relationship("BookDocument", back_populates="category", cascade="all, delete-orphan")


class TimePeriod(Base):
    __tablename__ = "time_periods"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    start_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    country_id = Column(String, ForeignKey("countries.id"), nullable=True)
    parent_id = Column(String, ForeignKey("time_periods.id"), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    country = relationship("Country", backref="time_periods")
    parent = relationship("TimePeriod", remote_side=[id], backref="children")
    books = relationship("BookDocument", back_populates="time_period", cascade="all, delete-orphan")


class BookDocument(Base):
    __tablename__ = "book_documents"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    author = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    cover_image = Column(String, nullable=True)
    thumbnail = Column(String, nullable=True)
    country_id = Column(String, ForeignKey("countries.id"), nullable=True)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True)
    time_period_id = Column(String, ForeignKey("time_periods.id"), nullable=True)
    author_era = Column(String, nullable=True)
    year_start = Column(Integer, nullable=True)
    year_end = Column(Integer, nullable=True)
    theme_year_start = Column(Integer, nullable=True)
    theme_year_end = Column(Integer, nullable=True)
    theme_year_status = Column(String, default="暂未确定")
    tags = Column(JSON, nullable=True)
    extra_metadata = Column(JSON, nullable=True)
    
    content_region_id = Column(String, ForeignKey("countries.id"), nullable=True)
    author_region_id = Column(String, ForeignKey("countries.id"), nullable=True)
    content_era_start = Column(Integer, nullable=True)
    content_era_end = Column(Integer, nullable=True)
    author_birth_year = Column(Integer, nullable=True)
    author_death_year = Column(Integer, nullable=True)
    content_era_description = Column(Text, nullable=True)
    author_era_description = Column(Text, nullable=True)
    
    quark_share_url = Column(String, nullable=True)
    quark_file_id = Column(String, nullable=True)
    quark_upload_status = Column(String, default='not_uploaded')
    quark_upload_time = Column(DateTime, nullable=True)
    
    file_hash_sha256 = Column(String(64), nullable=True, index=True)
    content_hash_simhash = Column(String(32), nullable=True, index=True)
    content_hash_murmur = Column(String(32), nullable=True, index=True)
    page_count = Column(Integer, nullable=True)
    duplicate_group_id = Column(String, nullable=True, index=True)
    is_primary = Column(Integer, default=1)
    duplicate_status = Column(String, default='unique')
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    country = relationship("Country", back_populates="books", foreign_keys=[country_id])
    content_region = relationship("Country", foreign_keys=[content_region_id])
    author_region = relationship("Country", foreign_keys=[author_region_id])
    category = relationship("Category", back_populates="books")
    time_period = relationship("TimePeriod", back_populates="books")
    time_periods = relationship("BookTimePeriod", back_populates="book", cascade="all, delete-orphan")
    timeline_events = relationship("WorldTimelineEvent", back_populates="book", cascade="all, delete-orphan")


class BookTimePeriod(Base):
    __tablename__ = "book_time_periods"

    id = Column(String, primary_key=True, default=generate_uuid)
    book_id = Column(String, ForeignKey("book_documents.id"), nullable=False)
    theme_year_start = Column(Integer, nullable=True)
    theme_year_end = Column(Integer, nullable=True)
    theme_year_status = Column(String, default="暂未确定")
    start_page = Column(Integer, nullable=True)
    end_page = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    book = relationship("BookDocument", back_populates="time_periods")


class WorldTimelineEvent(Base):
    """世界面板 - 书籍时间节点记录"""
    __tablename__ = "world_timeline_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    book_id = Column(String, ForeignKey("book_documents.id"), nullable=False)
    event_date = Column(String, nullable=False)  # 时间节点，格式：YYYY-MM-DD 或 YYYY-MM 或 YYYY
    event_date_display = Column(String, nullable=False)  # 显示格式（如：公元前221年、2024年3月）
    page_number = Column(Integer, nullable=False)  # 关联的页码
    event_title = Column(String, nullable=False)  # 事件标题
    event_description = Column(Text, nullable=True)  # 事件描述
    importance = Column(String, default="normal")  # 重要性：low, normal, high
    tags = Column(JSON, nullable=True)  # 标签
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    book = relationship("BookDocument", back_populates="timeline_events")


class DocumentTimelineEvent(Base):
    """文档时间轴事件 - 为文本文档提供时间轴支持"""
    __tablename__ = "document_timeline_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    event_date = Column(String, nullable=False)  # 时间节点
    event_date_display = Column(String, nullable=False)  # 显示格式
    event_title = Column(String, nullable=False)  # 事件标题
    event_description = Column(Text, nullable=True)  # 事件描述
    importance = Column(String, default="normal")  # 重要性
    tags = Column(JSON, nullable=True)  # 标签
    # 关联到文档中的位置（字符偏移量）
    content_offset = Column(Integer, nullable=True)
    # 时间笔记增强字段
    source_type = Column(String, default="text")  # 来源类型: text, video, document
    source_content = Column(Text, nullable=True)  # 原始内容片段
    ai_generated = Column(Integer, default=0)  # 是否为AI生成: 0=手动, 1=AI生成
    formatted_content = Column(Text, nullable=True)  # 规范化格式内容 [YYYY-MM-DD/事件标题/简短内容解释]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document", back_populates="timeline_events")


class QuickNote(Base):
    """快速笔记 - 临时笔记存储，支持快速记录和后续整理"""
    __tablename__ = "quick_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    content = Column(Text, nullable=False)  # 笔记内容
    title = Column(String, nullable=True)  # 标题（可为空，AI生成或手动添加）
    tags = Column(JSON, nullable=True)  # 标签
    group_id = Column(String, nullable=True)  # 分组ID，用于按页面或主题归类
    group_name = Column(String, nullable=True)  # 分组名称
    
    source_document_id = Column(String, ForeignKey("documents.id"), nullable=True)  # 关联的文档ID
    source_page = Column(Integer, nullable=True)  # 来源页码（如果是PDF笔记）
    source_type = Column(String, default="quick")  # 来源类型: quick, pdf, document
    
    is_processed = Column(Integer, default=0)  # 是否已处理: 0=未处理, 1=已处理
    processed_at = Column(DateTime, nullable=True)  # 处理时间
    converted_document_id = Column(String, ForeignKey("documents.id"), nullable=True)  # 转换后的标准笔记ID
    
    original_content = Column(Text, nullable=True)  # 原始内容（AI优化前的内容）
    ai_processed = Column(Integer, default=0)  # 是否经过AI处理: 0=否, 1=是
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source_document = relationship("Document", foreign_keys=[source_document_id])
    converted_document = relationship("Document", foreign_keys=[converted_document_id])
