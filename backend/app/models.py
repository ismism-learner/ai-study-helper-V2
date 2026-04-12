from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Float,
    Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())


def _utcnow():
    return datetime.now(timezone.utc)


class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("folders.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    documents = relationship(
        "Document", back_populates="folder", cascade="all, delete-orphan"
    )


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    action_type = Column(String, nullable=False, index=True)
    description = Column(String, nullable=False)
    details = Column(JSON, nullable=True)

    book_id = Column(String, ForeignKey("book_documents.id"), nullable=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=True, index=True)

    created_at = Column(DateTime, default=_utcnow, index=True)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_archive_status", "archive_status"),
        Index("ix_documents_doc_type", "doc_type"),
    )

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    original_content = Column(Text, nullable=False)
    framework_content = Column(Text, nullable=True)
    processed_content = Column(Text, nullable=True)
    generated_content = Column(Text, nullable=True)
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True, index=True)

    archive_status = Column(String, default="unarchived_doc", index=True)
    doc_type = Column(String, default="text_document", index=True)
    tags = Column(JSON, nullable=True)
    author = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    source_book_id = Column(
        String, ForeignKey("book_documents.id"), nullable=True, index=True
    )
    external_link = Column(String, nullable=True)

    content_country_id = Column(
        String, ForeignKey("countries.id"), nullable=True, index=True
    )
    content_year_start = Column(Integer, nullable=True)
    content_year_end = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    highlights = relationship(
        "Highlight", back_populates="document", cascade="all, delete-orphan"
    )
    folder = relationship("Folder", back_populates="documents")
    source_book = relationship("BookDocument", foreign_keys=[source_book_id])
    timeline_events = relationship(
        "DocumentTimelineEvent", back_populates="document", cascade="all, delete-orphan"
    )


class Highlight(Base):
    __tablename__ = "highlights"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False, index=True)
    highlighted_text = Column(Text, nullable=False)
    start_offset = Column(Integer, nullable=False)
    end_offset = Column(Integer, nullable=False)
    highlight_type = Column(String, default="explanation")
    explanation = Column(Text, nullable=True)
    prompt_template = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    document = relationship("Document", back_populates="highlights")


class Country(Base):
    __tablename__ = "countries"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False, unique=True)
    code = Column(String(10), nullable=False, unique=True)
    region = Column(String, nullable=True)
    continent = Column(String, nullable=True)
    geojson_properties = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    books = relationship(
        "BookDocument",
        back_populates="country",
        foreign_keys="BookDocument.country_id",
        cascade="all, delete-orphan",
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("categories.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    parent = relationship("Category", remote_side=[id], backref="children")
    books = relationship(
        "BookDocument", back_populates="category", cascade="all, delete-orphan"
    )


class TimePeriod(Base):
    __tablename__ = "time_periods"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    start_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    country_id = Column(String, ForeignKey("countries.id"), nullable=True, index=True)
    parent_id = Column(String, ForeignKey("time_periods.id"), nullable=True, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    country = relationship("Country", backref="time_periods")
    parent = relationship("TimePeriod", remote_side=[id], backref="children")
    books = relationship(
        "BookDocument", back_populates="time_period", cascade="all, delete-orphan"
    )


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
    country_id = Column(String, ForeignKey("countries.id"), nullable=True, index=True)
    category_id = Column(String, ForeignKey("categories.id"), nullable=True, index=True)
    time_period_id = Column(
        String, ForeignKey("time_periods.id"), nullable=True, index=True
    )
    author_era = Column(String, nullable=True)
    year_start = Column(Integer, nullable=True)
    year_end = Column(Integer, nullable=True)
    theme_year_start = Column(Integer, nullable=True)
    theme_year_end = Column(Integer, nullable=True)
    theme_year_status = Column(String, default="暂未确定")
    tags = Column(JSON, nullable=True)
    extra_metadata = Column(JSON, nullable=True)

    content_region_id = Column(
        String, ForeignKey("countries.id"), nullable=True, index=True
    )
    author_region_id = Column(
        String, ForeignKey("countries.id"), nullable=True, index=True
    )
    content_era_start = Column(Integer, nullable=True)
    content_era_end = Column(Integer, nullable=True)
    author_birth_year = Column(Integer, nullable=True)
    author_death_year = Column(Integer, nullable=True)
    content_era_description = Column(Text, nullable=True)
    author_era_description = Column(Text, nullable=True)

    quark_share_url = Column(String, nullable=True)
    quark_file_id = Column(String, nullable=True)
    quark_upload_status = Column(String, default="not_uploaded", index=True)
    quark_upload_time = Column(DateTime, nullable=True)

    file_hash_sha256 = Column(String(64), nullable=True, index=True)
    content_hash_simhash = Column(String(32), nullable=True, index=True)
    content_hash_murmur = Column(String(32), nullable=True, index=True)
    page_count = Column(Integer, nullable=True)
    duplicate_group_id = Column(String, nullable=True, index=True)
    is_primary = Column(Integer, default=1)
    duplicate_status = Column(String, default="unique", index=True)

    last_read_page = Column(Integer, default=1)
    last_read_time = Column(DateTime, nullable=True, index=True)
    total_reading_seconds = Column(Integer, default=0)
    reading_speed_pages_per_hour = Column(Float, nullable=True)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    country = relationship("Country", back_populates="books", foreign_keys=[country_id])
    content_region = relationship("Country", foreign_keys=[content_region_id])
    author_region = relationship("Country", foreign_keys=[author_region_id])
    category = relationship("Category", back_populates="books")
    time_period = relationship("TimePeriod", back_populates="books")
    time_periods = relationship(
        "BookTimePeriod", back_populates="book", cascade="all, delete-orphan"
    )
    timeline_events = relationship(
        "WorldTimelineEvent", back_populates="book", cascade="all, delete-orphan"
    )


class BookTimePeriod(Base):
    __tablename__ = "book_time_periods"

    id = Column(String, primary_key=True, default=generate_uuid)
    book_id = Column(
        String, ForeignKey("book_documents.id"), nullable=False, index=True
    )
    theme_year_start = Column(Integer, nullable=True)
    theme_year_end = Column(Integer, nullable=True)
    theme_year_status = Column(String, default="暂未确定")
    start_page = Column(Integer, nullable=True)
    end_page = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    book = relationship("BookDocument", back_populates="time_periods")


class WorldTimelineEvent(Base):
    __tablename__ = "world_timeline_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    book_id = Column(
        String, ForeignKey("book_documents.id"), nullable=False, index=True
    )
    event_date = Column(String, nullable=False, index=True)
    event_date_display = Column(String, nullable=False)
    page_number = Column(Integer, nullable=False)
    event_title = Column(String, nullable=False)
    event_description = Column(Text, nullable=True)
    importance = Column(String, default="normal")
    tags = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    book = relationship("BookDocument", back_populates="timeline_events")


class DocumentTimelineEvent(Base):
    __tablename__ = "document_timeline_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False, index=True)
    event_date = Column(String, nullable=False, index=True)
    event_date_display = Column(String, nullable=False)
    event_title = Column(String, nullable=False)
    event_description = Column(Text, nullable=True)
    importance = Column(String, default="normal")
    tags = Column(JSON, nullable=True)
    page_number = Column(Integer, nullable=True)
    content_offset = Column(Integer, nullable=True)
    source_type = Column(String, default="text")
    source_content = Column(Text, nullable=True)
    ai_generated = Column(Integer, default=0)
    formatted_content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow, index=True)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    document = relationship("Document", back_populates="timeline_events")


class QuickNote(Base):
    __tablename__ = "quick_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    content = Column(Text, nullable=False)
    title = Column(String, nullable=True)
    tags = Column(JSON, nullable=True)
    group_id = Column(String, nullable=True, index=True)
    group_name = Column(String, nullable=True)

    source_document_id = Column(
        String, ForeignKey("documents.id"), nullable=True, index=True
    )
    source_page = Column(Integer, nullable=True)
    source_type = Column(String, default="quick")

    is_processed = Column(Integer, default=0, index=True)
    processed_at = Column(DateTime, nullable=True)
    converted_document_id = Column(
        String, ForeignKey("documents.id"), nullable=True, index=True
    )

    original_content = Column(Text, nullable=True)
    ai_processed = Column(Integer, default=0)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    source_document = relationship("Document", foreign_keys=[source_document_id])
    converted_document = relationship("Document", foreign_keys=[converted_document_id])


class ChapterNote(Base):
    __tablename__ = "chapter_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    book_id = Column(String, ForeignKey("book_documents.id"), nullable=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=True, index=True)
    chapter_title = Column(String, nullable=False)
    original_text = Column(Text, nullable=False)
    markdown_content = Column(Text, nullable=True)
    status = Column(String, default="pending", index=True)
    start_page = Column(Integer, nullable=True)
    end_page = Column(Integer, nullable=True)
    tags = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    book = relationship("BookDocument", foreign_keys=[book_id])
    document = relationship("Document", foreign_keys=[document_id])


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime, nullable=False, index=True)
    completed = Column(Integer, default=0, index=True)
    completed_at = Column(DateTime, nullable=True)

    task_type = Column(String, default="general")
    target_value = Column(Integer, nullable=True)
    current_value = Column(Integer, default=0)

    priority = Column(String, default="normal")

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class VisualizationNode(Base):
    """可视化节点 - 存储AI规范化后的代码块节点"""

    __tablename__ = "visualization_nodes"

    id = Column(String, primary_key=True, default=generate_uuid)

    # 关联
    book_id = Column(String, ForeignKey("book_documents.id"), nullable=True, index=True)
    chapter_note_id = Column(
        String, ForeignKey("chapter_notes.id"), nullable=True, index=True
    )

    # 节点基本信息
    node_type = Column(String, nullable=False)  # formula, code, chart, geometry
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # 原始内容
    source_content = Column(Text, nullable=False)  # 原始代码/公式

    # AI规范化后的内容
    normalized_content = Column(Text, nullable=True)  # AI处理后的内容
    render_config = Column(JSON, nullable=True)  # 渲染配置（如chart类型、参数等）

    # 节点位置（画布上的坐标）
    position_x = Column(Float, default=0)
    position_y = Column(Float, default=0)
    width = Column(Integer, default=300)
    height = Column(Integer, default=200)

    # 连接信息（存储与其他节点的连接）
    connections = Column(JSON, nullable=True)  # [{target_id, type, label}]

    # 元数据
    language = Column(String, nullable=True)  # python, latex, javascript等
    confidence = Column(String, default="high")  # high, medium
    is_active = Column(Integer, default=1)  # 是否在画布上显示

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    book = relationship("BookDocument", foreign_keys=[book_id])
    chapter_note = relationship("ChapterNote", foreign_keys=[chapter_note_id])
