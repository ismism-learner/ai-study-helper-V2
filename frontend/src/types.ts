export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
}

export interface Document {
  id: string;
  title: string;
  original_content: string;
  framework_content: string | null;
  processed_content: string | null;
  folder_id: string | null;
  // 新增字段
  archive_status: 'unarchived_book' | 'archived_book' | 'unarchived_doc' | 'archived_doc' | null;
  doc_type: 'pdf_ebook' | 'text_document' | null;
  tags: string[] | null;
  author: string | null;
  description: string | null;
  file_path: string | null;
  source_book_id: string | null;
  external_link: string | null;
  // 内容发生地和时间
  content_country_id: string | null;
  content_year_start: number | null;
  content_year_end: number | null;
  created_at: string;
  updated_at: string;
  highlights: Highlight[];
  // 时间笔记数量
  timeline_events_count?: number;
}

export interface DocumentTimelineEvent {
  id: string;
  document_id: string;
  event_date: string;
  event_date_display: string;
  event_title: string;
  event_description: string | null;
  importance: 'low' | 'normal' | 'high';
  tags: string[] | null;
  content_offset: number | null;
  created_at: string;
  updated_at: string;
}

export interface Highlight {
  id: string;
  document_id: string;
  highlighted_text: string;
  start_offset: number;
  end_offset: number;
  highlight_type: 'explanation' | 'keyword' | 'tag';
  explanation: string | null;
  prompt_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentRequest {
  title: string;
  original_content: string;
  folder_id?: string;
}

export interface CreateHighlightRequest {
  highlighted_text: string;
  start_offset: number;
  end_offset: number;
  highlight_type?: 'explanation' | 'keyword' | 'tag';
  prompt_template?: string;
}

export interface ExplainRequest {
  highlight_id: string;
  custom_prompt?: string;
}

export interface ParagraphOptimizeRequest {
  paragraph: string;
}

export interface ParagraphOptimizeResponse {
  original: string;
  optimized: string;
}

export interface ParagraphState {
  id: string;
  originalText: string;
  optimizedText: string | null;
  isProcessing: boolean;
  showComparison: boolean;
  selectedVersion: 'original' | 'optimized';
  editedOriginal: string;
  editedOptimized: string;
}

export interface PhilosophyKeyword {
  code: string;
  name: string;
  field: string;
  ontology: string[];
  epistemology: string[];
  teleology: string[];
  extra?: string;
}

export interface ParsedKeyword {
  left: string;
  right?: string;
  connector?: string;
}

export interface PhilosophyKeywordMatch {
  code: string;
  name: string;
  keywords: {
    field: string;
    ontology: ParsedKeyword[];
    epistemology: ParsedKeyword[];
    teleology: ParsedKeyword[];
  };
}

export interface Country {
  id: string;
  name: string;
  code: string;
  region: string | null;
  continent: string | null;
  geojson_properties: Record<string, any> | null;
  book_count: number;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  book_count: number;
  created_at: string;
  updated_at: string;
}

export interface TimePeriod {
  id: string;
  name: string;
  start_year: number | null;
  end_year: number | null;
  country_id: string | null;
  parent_id: string | null;
  description: string | null;
  book_count: number;
  children: TimePeriod[];
  created_at: string;
  updated_at: string;
}

export interface BookTimePeriod {
  id: string;
  book_id: string;
  theme_year_start: number | null;
  theme_year_end: number | null;
  theme_year_status: string;
  start_page: number | null;
  end_page: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookDocument {
  id: string;
  title: string;
  original_filename: string | null;
  author: string | null;
  description: string | null;
  file_path: string;
  file_size: number | null;
  cover_image: string | null;
  thumbnail: string | null;
  country_id: string | null;
  author_country_id: string | null;
  author_time_period_id: string | null;
  category_id: string | null;
  time_period_id: string | null;
  author_era: string | null;
  year_start: number | null;
  year_end: number | null;
  theme_year_start: number | null;
  theme_year_end: number | null;
  theme_year_status: string | null;
  tags: string[] | null;
  extra_metadata: Record<string, any> | null;
  
  content_region_id: string | null;
  author_region_id: string | null;
  content_era_start: number | null;
  content_era_end: number | null;
  author_birth_year: number | null;
  author_death_year: number | null;
  content_era_description: string | null;
  author_era_description: string | null;
  
  quark_share_url: string | null;
  quark_file_id: string | null;
  quark_upload_status: string | null;
  quark_upload_time: string | null;
  
  page_count: number | null;
  notes_count: number;
  last_read_page: number;
  last_read_time: string | null;
  total_reading_seconds: number;
  reading_speed_pages_per_hour: number | null;
  time_periods: BookTimePeriod[];
  country: Country | null;
  category: Category | null;
  time_period: TimePeriod | null;
  content_region: Country | null;
  author_region: Country | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  year: number;
  books: BookDocument[];
}

export interface BookUploadData {
  file: File;
  title: string;
  author?: string;
  description?: string;
  country_id?: string;
  category_id?: string;
  time_period_id?: string;
  author_era?: string;
  theme_year_start?: number;
  theme_year_end?: number;
  theme_year_status?: string;
  year_start?: number;
  year_end?: number;
  tags?: string[];
  content_region_id?: string;
  author_region_id?: string;
  content_era_start?: number;
  content_era_end?: number;
  author_birth_year?: number;
  author_death_year?: number;
  content_era_description?: string;
  author_era_description?: string;
}

export interface CountryCreateRequest {
  name: string;
  code: string;
  region?: string;
  continent?: string;
  geojson_properties?: Record<string, any>;
}

export interface CategoryCreateRequest {
  name: string;
  parent_id?: string;
}

export interface TimePeriodCreateRequest {
  name: string;
  start_year?: number;
  end_year?: number;
  country_id?: string;
  parent_id?: string;
  description?: string;
}

export interface OCRTextBlock {
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  font_size: number;
  confidence: number;
}

export interface OCRPageResult {
  page_number: number;
  width: number;
  height: number;
  blocks: OCRTextBlock[];
}

export interface OCRResult {
  file_path: string;
  total_pages: number;
  pages: OCRPageResult[];
}

export interface WorldTimelineEvent {
  id: string;
  book_id: string;
  event_date: string;
  event_date_display: string;
  page_number: number;
  event_title: string;
  event_description: string | null;
  importance: 'low' | 'normal' | 'high';
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentTimelineEventRequest {
  event_date: string;
  event_date_display: string;
  event_title: string;
  event_description?: string;
  importance?: 'low' | 'normal' | 'high';
  tags?: string[];
  content_offset?: number;
  source_type?: string;
  source_content?: string;
  ai_generated?: number;
}

export interface CreateTimelineEventRequest {
  event_date: string;
  event_date_display: string;
  page_number: number;
  event_title: string;
  event_description?: string;
  importance?: 'low' | 'normal' | 'high';
  tags?: string[];
}

export interface UpdateTimelineEventRequest {
  event_date?: string;
  event_date_display?: string;
  page_number?: number;
  event_title?: string;
  event_description?: string;
  importance?: 'low' | 'normal' | 'high';
  tags?: string[];
}

export interface BookTimelineSummary {
  book_id: string;
  book_title: string;
  total_events: number;
  date_range: string | null;
}

export interface DocumentTimelineEvent {
  id: string;
  document_id: string;
  event_date: string;
  event_date_display: string;
  event_title: string;
  event_description: string | null;
  importance: 'low' | 'normal' | 'high';
  tags: string[] | null;
  content_offset: number | null;
  source_type: string | null;
  source_content: string | null;
  ai_generated: number | null;
  formatted_content: string | null;
  created_at: string;
  updated_at: string;
}
export interface TimelineNoteParseResult {
  event_date: string;
  event_date_display: string;
  event_title: string;
  event_description: string;
}
export interface AIGenerateTimelineNotesResponse {
  raw_output: string;
  parsed_events: TimelineNoteParseResult[];
  total_events: number;
}
export interface SaveTimelineNotesBatchResponse {
  success: boolean;
  saved_count: number;
  events: Array<{
    id: string;
    event_date: string;
    event_date_display: string;
    event_title: string;
    event_description: string;
  }>;
}
export interface TimelineTagsHistoryResponse {
  tags: string[];
  tags_with_count: Array<{
    tag: string;
    count: number;
  }>;
}
