from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class FolderBase(BaseModel):
    name: str
    parent_id: str | None = None


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
    folder_id: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    original_content: str | None = None
    framework_content: str | None = None
    processed_content: str | None = None
    folder_id: str | None = None
    archive_status: str | None = None
    doc_type: str | None = None
    tags: list[str] | None = None
    author: str | None = None
    description: str | None = None
    external_link: str | None = None
    content_country_id: str | None = None
    content_year_start: int | None = None
    content_year_end: int | None = None


class HighlightBase(BaseModel):
    highlighted_text: str
    start_offset: int
    end_offset: int
    highlight_type: str | None = "explanation"


class HighlightCreate(HighlightBase):
    prompt_template: str | None = None


class HighlightUpdate(BaseModel):
    explanation: str | None = None
    prompt_template: str | None = None
    highlight_type: str | None = None


class HighlightResponse(HighlightBase):
    id: str
    document_id: str
    explanation: str | None = None
    prompt_template: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentResponse(DocumentBase):
    id: str
    framework_content: str | None = None
    processed_content: str | None = None
    folder_id: str | None = None
    archive_status: str | None = None
    doc_type: str | None = None
    tags: list[str] | None = None
    author: str | None = None
    description: str | None = None
    file_path: str | None = None
    source_book_id: str | None = None
    external_link: str | None = None
    content_country_id: str | None = None
    content_year_start: int | None = None
    content_year_end: int | None = None
    created_at: datetime
    updated_at: datetime
    highlights: list[HighlightResponse] = []

    class Config:
        from_attributes = True


class DocumentTimelineEventCreate(BaseModel):
    event_date: str
    event_date_display: str | None = None
    event_title: str
    event_description: str | None = None
    importance: str | None = "normal"
    tags: list[str] | None = None
    page_number: int | None = None
    content_offset: int | None = None
    source_type: str | None = "text"
    source_content: str | None = None
    ai_generated: int | None = 0
    formatted_content: str | None = None


class DocumentTimelineEventUpdate(BaseModel):
    event_date: str | None = None
    event_date_display: str | None = None
    event_title: str | None = None
    event_description: str | None = None
    importance: str | None = None
    tags: list[str] | None = None
    content_offset: int | None = None
    source_type: str | None = None
    source_content: str | None = None
    ai_generated: int | None = None
    formatted_content: str | None = None


class DocumentTimelineEventResponse(BaseModel):
    id: str
    document_id: str
    event_date: str
    event_date_display: str
    event_title: str
    event_description: str | None = None
    importance: str
    tags: list[str] | None = None
    content_offset: int | None = None
    source_type: str | None = "text"
    source_content: str | None = None
    ai_generated: int | None = 0
    formatted_content: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExplainRequest(BaseModel):
    highlight_id: str
    custom_prompt: str | None = None


class ExplainResponse(BaseModel):
    highlight_id: str
    explanation: str


class SettingsResponse(BaseModel):
    api_key: str = ""
    api_base: str = ""
    model_name: str = ""
    ai_backend_type: str = ""
    opencode_cli_path: str = ""
    framework_prompt: str = ""
    explain_prompt: str = ""
    optimize_prompt: str = ""
    quick_note_polish_prompt: str = ""
    chapter_note_system_prompt: str = ""
    chapter_note_prompt: str = ""
    timeline_prompt: str = ""
    long_text_rewrite_system_prompt: str = ""
    long_text_rewrite_prompt: str = ""
    batch_upload_size: int = 5
    embedding_enabled: bool = False
    embedding_model: str = ""
    embedding_device: str = ""
    kg_concept_prompt: str = ""
    quick_summary_prompt: str = ""
    polish_note_prompt: str = ""
    polish_note_system_prompt: str = ""
    generate_note_prompt: str = ""
    generate_note_system_prompt: str = ""
    structure_system_prompt: str = ""
    structure_user_prompt: str = ""
    section_fill_prompt: str = ""
    kg_concept_user_prompt: str = ""
    kg_concept_prompt: str = ""
    quick_summary_prompt: str = ""

    class Config:
        from_attributes = True


class ModelsResponse(BaseModel):
    models: list[str]


class SettingsUpdate(BaseModel):
    api_key: str | None = None
    api_base: str | None = None
    model_name: str | None = None
    ai_backend_type: str | None = None
    opencode_cli_path: str | None = None
    framework_prompt: str | None = None
    explain_prompt: str | None = None
    optimize_prompt: str | None = None
    quick_note_polish_prompt: str | None = None
    chapter_note_system_prompt: str | None = None
    chapter_note_prompt: str | None = None
    timeline_prompt: str | None = None
    long_text_rewrite_system_prompt: str | None = None
    long_text_rewrite_prompt: str | None = None
    batch_upload_size: int | None = None
    embedding_enabled: bool | None = None
    embedding_model: str | None = None
    embedding_device: str | None = None
    kg_concept_prompt: str | None = None
    quick_summary_prompt: str | None = None
    polish_note_prompt: str | None = None
    polish_note_system_prompt: str | None = None
    generate_note_prompt: str | None = None
    generate_note_system_prompt: str | None = None
    structure_system_prompt: str | None = None
    structure_user_prompt: str | None = None
    section_fill_prompt: str | None = None
    kg_concept_user_prompt: str | None = None


class APIConfigCreate(BaseModel):
    name: str
    api_key: str
    api_base: str
    model_name: str


class APIConfigUpdate(BaseModel):
    name: str | None = None
    api_key: str | None = None
    api_base: str | None = None
    model_name: str | None = None


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
    title: str | None = None
    tags: list[str] | None = None
    group_id: str | None = None
    group_name: str | None = None
    source_document_id: str | None = None
    source_page: int | None = None
    source_type: str | None = "quick"


class QuickNoteUpdate(BaseModel):
    content: str | None = None
    title: str | None = None
    tags: list[str] | None = None
    group_id: str | None = None
    group_name: str | None = None
    is_processed: int | None = None


class QuickNoteResponse(BaseModel):
    id: str
    content: str
    title: str | None = None
    tags: list[str] | None = None
    group_id: str | None = None
    group_name: str | None = None
    source_document_id: str | None = None
    source_page: int | None = None
    source_type: str
    is_processed: int
    processed_at: datetime | None = None
    converted_document_id: str | None = None
    original_content: str | None = None
    ai_processed: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class QuickNoteBatchProcessRequest(BaseModel):
    note_ids: list[str]
    auto_convert: bool | None = False


class QuickNoteAIResult(BaseModel):
    note_id: str
    original_content: str
    generated_title: str
    optimized_content: str
    suggested_tags: list[str]


class QuickNoteBatchProcessResponse(BaseModel):
    results: list[QuickNoteAIResult]
    total: int
    success: int
    failed: int


class ChapterNoteCreate(BaseModel):
    book_id: str | None = None
    document_id: str | None = None
    chapter_title: str
    original_text: str
    start_page: int | None = None
    end_page: int | None = None
    tags: list[str] | None = None


class ChapterNoteUpdate(BaseModel):
    chapter_title: str | None = None
    original_text: str | None = None
    markdown_content: str | None = None
    status: str | None = None
    start_page: int | None = None
    end_page: int | None = None
    tags: list[str] | None = None


class ChapterNoteResponse(BaseModel):
    id: str
    book_id: str | None = None
    document_id: str | None = None
    chapter_title: str
    original_text: str
    markdown_content: str | None = None
    status: str
    start_page: int | None = None
    end_page: int | None = None
    tags: list[str] | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChapterNoteGenerateRequest(BaseModel):
    original_text: str
    chapter_title: str | None = None


class StructureGenerateRequest(BaseModel):
    original_text: str
    chapter_title: str | None = None


class SectionGenerateRequest(BaseModel):
    section_text: str
    section_info: dict
    structure: dict
    chapter_title: str | None = None


class SplitByStructureRequest(BaseModel):
    original_text: str
    structure: dict
