from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class FolderBase(BaseModel):
    name: str
    parent_id: Optional[str] = None


class FolderCreate(FolderBase):
    pass


class FolderResponse(FolderBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentBase(BaseModel):
    title: str
    original_content: str


class DocumentCreate(DocumentBase):
    folder_id: Optional[str] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    original_content: Optional[str] = None
    framework_content: Optional[str] = None
    processed_content: Optional[str] = None
    folder_id: Optional[str] = None
    archive_status: Optional[str] = None
    doc_type: Optional[str] = None
    tags: Optional[List[str]] = None
    author: Optional[str] = None
    description: Optional[str] = None
    external_link: Optional[str] = None
    content_country_id: Optional[str] = None
    content_year_start: Optional[int] = None
    content_year_end: Optional[int] = None


class HighlightBase(BaseModel):
    highlighted_text: str
    start_offset: int
    end_offset: int
    highlight_type: Optional[str] = "explanation"


class HighlightCreate(HighlightBase):
    prompt_template: Optional[str] = None


class HighlightUpdate(BaseModel):
    explanation: Optional[str] = None
    prompt_template: Optional[str] = None
    highlight_type: Optional[str] = None


class HighlightResponse(HighlightBase):
    id: str
    document_id: str
    explanation: Optional[str] = None
    prompt_template: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentResponse(DocumentBase):
    id: str
    framework_content: Optional[str] = None
    processed_content: Optional[str] = None
    folder_id: Optional[str] = None
    archive_status: Optional[str] = None
    doc_type: Optional[str] = None
    tags: Optional[List[str]] = None
    author: Optional[str] = None
    description: Optional[str] = None
    file_path: Optional[str] = None
    source_book_id: Optional[str] = None
    external_link: Optional[str] = None
    content_country_id: Optional[str] = None
    content_year_start: Optional[int] = None
    content_year_end: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    highlights: List[HighlightResponse] = []

    class Config:
        from_attributes = True


class DocumentTimelineEventCreate(BaseModel):
    event_date: str
    event_date_display: Optional[str] = None
    event_title: str
    event_description: Optional[str] = None
    importance: Optional[str] = "normal"
    tags: Optional[List[str]] = None
    page_number: Optional[int] = None
    content_offset: Optional[int] = None
    source_type: Optional[str] = "text"
    source_content: Optional[str] = None
    ai_generated: Optional[int] = 0
    formatted_content: Optional[str] = None


class DocumentTimelineEventUpdate(BaseModel):
    event_date: Optional[str] = None
    event_date_display: Optional[str] = None
    event_title: Optional[str] = None
    event_description: Optional[str] = None
    importance: Optional[str] = None
    tags: Optional[List[str]] = None
    content_offset: Optional[int] = None
    source_type: Optional[str] = None
    source_content: Optional[str] = None
    ai_generated: Optional[int] = None
    formatted_content: Optional[str] = None


class DocumentTimelineEventResponse(BaseModel):
    id: str
    document_id: str
    event_date: str
    event_date_display: str
    event_title: str
    event_description: Optional[str] = None
    importance: str
    tags: Optional[List[str]] = None
    content_offset: Optional[int] = None
    source_type: Optional[str] = "text"
    source_content: Optional[str] = None
    ai_generated: Optional[int] = 0
    formatted_content: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExplainRequest(BaseModel):
    highlight_id: str
    custom_prompt: Optional[str] = None


class ExplainResponse(BaseModel):
    highlight_id: str
    explanation: str


class SettingsResponse(BaseModel):
    api_key: str
    api_base: str
    model_name: str
    ai_backend_type: str = "api"
    opencode_cli_path: str = "opencode"
    framework_prompt: str
    explain_prompt: str
    optimize_prompt: str
    quick_note_polish_prompt: str = ""
    chapter_note_system_prompt: str = ""
    chapter_note_prompt: str = ""
    timeline_prompt: str = ""
    long_text_rewrite_system_prompt: str = ""
    long_text_rewrite_prompt: str = ""
    batch_upload_size: int = 5
    neo4j_enabled: bool = False
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""
    kg_concept_prompt: str = ""
    quick_summary_prompt: str = ""

    class Config:
        from_attributes = True


class ModelsResponse(BaseModel):
    models: List[str]


class SettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model_name: Optional[str] = None
    ai_backend_type: Optional[str] = None
    opencode_cli_path: Optional[str] = None
    framework_prompt: Optional[str] = None
    explain_prompt: Optional[str] = None
    optimize_prompt: Optional[str] = None
    quick_note_polish_prompt: Optional[str] = None
    chapter_note_system_prompt: Optional[str] = None
    chapter_note_prompt: Optional[str] = None
    timeline_prompt: Optional[str] = None
    long_text_rewrite_system_prompt: Optional[str] = None
    long_text_rewrite_prompt: Optional[str] = None
    batch_upload_size: Optional[int] = None
    neo4j_enabled: Optional[bool] = None
    neo4j_uri: Optional[str] = None
    neo4j_user: Optional[str] = None
    neo4j_password: Optional[str] = None
    kg_concept_prompt: Optional[str] = None
    quick_summary_prompt: Optional[str] = None


class APIConfigCreate(BaseModel):
    name: str
    api_key: str
    api_base: str
    model_name: str


class APIConfigUpdate(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model_name: Optional[str] = None


class APIConfigResponse(BaseModel):
    id: str
    name: str
    api_key: str
    api_base: str
    model_name: str
    is_active: bool

    class Config:
        from_attributes = True


class ParagraphOptimizeRequest(BaseModel):
    paragraph: str


class ParagraphOptimizeResponse(BaseModel):
    original: str
    optimized: str


class NotePolishRequest(BaseModel):
    note_content: str


class NotePolishResponse(BaseModel):
    original: str
    polished: str


class NoteGenerateRequest(BaseModel):
    note_content: str


class NoteGenerateResponse(BaseModel):
    title: str
    content: str


class QuickNoteCreate(BaseModel):
    content: str
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    source_document_id: Optional[str] = None
    source_page: Optional[int] = None
    source_type: Optional[str] = "quick"


class QuickNoteUpdate(BaseModel):
    content: Optional[str] = None
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    is_processed: Optional[int] = None


class QuickNoteResponse(BaseModel):
    id: str
    content: str
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    source_document_id: Optional[str] = None
    source_page: Optional[int] = None
    source_type: str
    is_processed: int
    processed_at: Optional[datetime] = None
    converted_document_id: Optional[str] = None
    original_content: Optional[str] = None
    ai_processed: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class QuickNoteBatchProcessRequest(BaseModel):
    note_ids: List[str]
    auto_convert: Optional[bool] = False


class QuickNoteAIResult(BaseModel):
    note_id: str
    original_content: str
    generated_title: str
    optimized_content: str
    suggested_tags: List[str]


class QuickNoteBatchProcessResponse(BaseModel):
    results: List[QuickNoteAIResult]
    total: int
    success: int
    failed: int


class ChapterNoteCreate(BaseModel):
    book_id: Optional[str] = None
    document_id: Optional[str] = None
    chapter_title: str
    original_text: str
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    tags: Optional[List[str]] = None


class ChapterNoteUpdate(BaseModel):
    chapter_title: Optional[str] = None
    original_text: Optional[str] = None
    markdown_content: Optional[str] = None
    status: Optional[str] = None
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    tags: Optional[List[str]] = None


class ChapterNoteResponse(BaseModel):
    id: str
    book_id: Optional[str] = None
    document_id: Optional[str] = None
    chapter_title: str
    original_text: str
    markdown_content: Optional[str] = None
    status: str
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    tags: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChapterNoteGenerateRequest(BaseModel):
    original_text: str
    chapter_title: Optional[str] = None


class StructureGenerateRequest(BaseModel):
    original_text: str
    chapter_title: Optional[str] = None


class SectionGenerateRequest(BaseModel):
    section_text: str
    section_info: dict
    structure: dict
    chapter_title: Optional[str] = None


class SplitByStructureRequest(BaseModel):
    original_text: str
    structure: dict
