import axios from 'axios';
import {
  Document,
  Highlight,
  CreateDocumentRequest,
  CreateHighlightRequest,
  ExplainRequest,
  ParagraphOptimizeResponse,
  Country,
  Category,
  TimePeriod,
  BookDocument,
  TimelineEntry,
  CountryCreateRequest,
  CategoryCreateRequest,
  TimePeriodCreateRequest,
  WorldTimelineEvent,
  CreateTimelineEventRequest,
  UpdateTimelineEventRequest,
  BookTimelineSummary,
} from './types';

const api = axios.create({
  baseURL: '/api',
});

const uploadApi = axios.create({
  baseURL: '/api',
});

export const documentApi = {
  list: (params?: { 
    folder_id?: string; 
    archive_status?: string; 
    doc_type?: string;
    tag?: string;
    search?: string;
  }) => api.get<Document[]>('/documents', { params }),

  get: (id: string) => api.get<Document>(`/documents/${id}`),

  create: (data: CreateDocumentRequest) => api.post<Document>('/documents', data),

  upload: (file: File, folderId?: string, archiveStatus?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folder_id', folderId);
    if (archiveStatus) formData.append('archive_status', archiveStatus);
    return uploadApi.post<Document>('/documents/upload', formData);
  },

  uploadBatch: (files: File[], folderId?: string, archiveStatus?: string) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (folderId) formData.append('folder_id', folderId);
    if (archiveStatus) formData.append('archive_status', archiveStatus);
    return uploadApi.post<Document[]>('/documents/upload-batch', formData);
  },

  generateFramework: (id: string) =>
    api.post<Document>(`/documents/${id}/generate-framework`),

  generateFrameworkStream: async (
    id: string,
    onChunk: (chunk: string) => void,
    onDone: (fullContent: string) => void,
    onError: (error: string) => void
  ) => {
    try {
      const response = await fetch(`/api/documents/${id}/generate-framework-stream`, {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        onError(errorData.detail || '请求失败');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('无法读取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                onError(data.error);
                return;
              }
              if (data.done) {
                if (data.full_content) {
                  onDone(data.full_content);
                }
                return;
              }
              if (data.content) {
                onChunk(data.content);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', line, e);
            }
          }
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : '未知错误');
    }
  },

  update: (id: string, data: Partial<Document>) =>
    api.put<Document>(`/documents/${id}`, data),

  move: (id: string, folderId: string | null) =>
    api.put<Document>(`/documents/${id}`, { folder_id: folderId }),

  moveBatch: async (ids: string[], folderId: string | null) => {
    const results = await Promise.all(
      ids.map(id => api.put<Document>(`/documents/${id}`, { folder_id: folderId }))
    );
    return results.map(r => r.data);
  },

  delete: (id: string) => api.delete(`/documents/${id}`),

  // 标签和统计
  getTags: () => api.get<string[]>('/documents/tags'),
  getStats: () => api.get<{
    total: number;
    unarchived_book: number;
    archived_book: number;
    unarchived_doc: number;
    archived_doc: number;
    pdf_ebook: number;
    text_document: number;
  }>('/documents/stats'),

  // 批量生成相关
  batchGenerateContent: (documentIds: string[]) =>
    api.post<{
      success: boolean;
      results: Array<{
        id: string;
        success: boolean;
        title?: string;
        error?: string;
        error_type?: string;
        skipped?: boolean;
        message?: string;
      }>;
      total: number;
      completed: number;
      failed: number;
    }>('/documents/batch-generate-content', { document_ids: documentIds }),

  getIncompleteGenerations: (minLength?: number) =>
    api.get<{
      total: number;
      min_length_threshold: number;
      documents: Array<{
        id: string;
        title: string;
        original_content_length: number;
        framework_content_length: number;
        issues: string[];
        created_at: string | null;
        updated_at: string | null;
      }>;
    }>('/documents/incomplete-generations', {
      params: minLength ? { min_length: minLength } : undefined
    }),

  batchRegenerateContent: (documentIds: string[], forceRegenerate: boolean = true) =>
    api.post<{
      success: boolean;
      results: Array<{
        id: string;
        success: boolean;
        title?: string;
        old_length?: number;
        new_length?: number;
        error?: string;
        error_type?: string;
        skipped?: boolean;
        message?: string;
      }>;
      total: number;
      completed: number;
      failed: number;
    }>('/documents/batch-regenerate', {
      document_ids: documentIds,
      force_regenerate: forceRegenerate
    }),
};

export const folderApi = {
  list: () => api.get<any[]>('/folders'),

  create: (name: string, parentId?: string) =>
    api.post('/folders', { name, parent_id: parentId }),

  update: (id: string, data: { name?: string; parent_id?: string }) =>
    api.put(`/folders/${id}`, data),

  delete: (id: string) => api.delete(`/folders/${id}`),
};

export const highlightApi = {
  list: (documentId: string) =>
    api.get<Highlight[]>(`/documents/${documentId}/highlights`),

  create: (documentId: string, data: CreateHighlightRequest) =>
    api.post<Highlight>(`/documents/${documentId}/highlights`, data),

  get: (id: string) => api.get<Highlight>(`/highlights/${id}`),

  delete: (id: string) => api.delete(`/highlights/${id}`),

  update: (id: string, data: Partial<Highlight>) =>
    api.put<Highlight>(`/highlights/${id}`, data),

  explain: (data: ExplainRequest) =>
    api.post<{ highlight_id: string; explanation: string }>(
      '/highlights/explain',
      data
    ),
};

export const optimizeApi = {
  optimizeParagraph: (paragraph: string) =>
    api.post<ParagraphOptimizeResponse>('/optimize-paragraph', { paragraph }),

  optimizeParagraphStream: async (
    paragraph: string,
    onChunk: (chunk: string) => void,
    onDone: (fullContent: string) => void,
    onError: (error: string) => void
  ) => {
    try {
      const response = await fetch('/api/optimize-paragraph-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ paragraph }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        onError(errorData.detail || '请求失败');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        onError('无法读取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                onError(data.error);
                return;
              }
              if (data.done) {
                if (data.full_content) {
                  onDone(data.full_content);
                }
                return;
              }
              if (data.content) {
                onChunk(data.content);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', line, e);
            }
          }
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : '未知错误');
    }
  },

  polishNote: (noteContent: string) =>
    api.post<{ original: string; polished: string }>('/polish-note', { note_content: noteContent }),

  generateNote: (noteContent: string) =>
    api.post<{ title: string; content: string }>('/generate-note', { note_content: noteContent }),
};

const libraryApi = axios.create({
  baseURL: '/api/library',
});

const libraryUploadApi = axios.create({
  baseURL: '/api/library',
});

export { libraryApi, libraryUploadApi };

export const countryApi = {
  list: () => libraryApi.get<Country[]>('/countries'),
  
  get: (id: string) => libraryApi.get<Country>(`/countries/${id}`),
  
  getByCode: (code: string) => libraryApi.get<Country>(`/countries/code/${code}`),
  
  create: (data: CountryCreateRequest) => libraryApi.post<Country>('/countries', data),
  
  getTimeline: (id: string) => libraryApi.get<TimelineEntry[]>(`/countries/${id}/timeline`),
  
  getBooks: (id: string) => libraryApi.get<BookDocument[]>(`/countries/${id}/books`),
};

export const categoryApi = {
  list: () => libraryApi.get<Category[]>('/categories'),
  
  create: (data: CategoryCreateRequest) => libraryApi.post<Category>('/categories', data),
};

export const timePeriodApi = {
  list: (countryId?: string) => {
    const params = countryId ? { country_id: countryId } : {};
    return libraryApi.get<TimePeriod[]>('/time-periods', { params });
  },
  
  create: (data: TimePeriodCreateRequest) => libraryApi.post<TimePeriod>('/time-periods', data),
};

export const bookApi = {
  list: (params?: {
    country_id?: string;
    category_id?: string;
    time_period_id?: string;
    year_from?: number;
    year_to?: number;
    search?: string;
  }) => libraryApi.get<BookDocument[]>('/books', { params }),

  getTags: () => libraryApi.get<{ tags: string[] }>('/tags'),

  get: (id: string) => libraryApi.get<BookDocument>(`/books/${id}`),

  upload: (data: {
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
  }) => {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('title', data.title);
    if (data.author) formData.append('author', data.author);
    if (data.description) formData.append('description', data.description);
    if (data.country_id) formData.append('country_id', data.country_id);
    if (data.category_id) formData.append('category_id', data.category_id);
    if (data.time_period_id) formData.append('time_period_id', data.time_period_id);
    if (data.author_era) formData.append('author_era', data.author_era);
    if (data.theme_year_start) formData.append('theme_year_start', data.theme_year_start.toString());
    if (data.theme_year_end) formData.append('theme_year_end', data.theme_year_end.toString());
    if (data.theme_year_status) formData.append('theme_year_status', data.theme_year_status);
    if (data.year_start) formData.append('year_start', data.year_start.toString());
    if (data.year_end) formData.append('year_end', data.year_end.toString());
    if (data.tags && data.tags.length > 0) {
      formData.append('tags', data.tags.join(','));
    }
    if (data.content_region_id) formData.append('content_region_id', data.content_region_id);
    if (data.author_region_id) formData.append('author_region_id', data.author_region_id);
    if (data.content_era_start) formData.append('content_era_start', data.content_era_start.toString());
    if (data.content_era_end) formData.append('content_era_end', data.content_era_end.toString());
    if (data.author_birth_year) formData.append('author_birth_year', data.author_birth_year.toString());
    if (data.author_death_year) formData.append('author_death_year', data.author_death_year.toString());
    if (data.content_era_description) formData.append('content_era_description', data.content_era_description);
    if (data.author_era_description) formData.append('author_era_description', data.author_era_description);
    return libraryUploadApi.post<BookDocument>('/books/upload', formData);
  },

  uploadBatch: (files: File[], countryId?: string) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (countryId) formData.append('country_id', countryId);
    return libraryUploadApi.post<BookDocument[]>('/books/upload-batch', formData);
  },

  update: (id: string, data: Partial<BookDocument>) =>
    libraryApi.put<BookDocument>(`/books/${id}`, data),

  delete: (id: string) => libraryApi.delete(`/books/${id}`),

  renameFile: (id: string, newFileName: string) =>
    libraryApi.post<{ success: boolean; new_path?: string }>(`/books/${id}/rename-file?new_file_name=${encodeURIComponent(newFileName)}`),

  createTimePeriod: (bookId: string, data: {
    theme_year_start?: number;
    theme_year_end?: number;
    theme_year_status?: string;
    start_page?: number;
    end_page?: number;
    description?: string;
  }) => libraryApi.post(`/books/${bookId}/time-periods`, data),

  updateTimePeriod: (timePeriodId: string, data: {
    theme_year_start?: number;
    theme_year_end?: number;
    theme_year_status?: string;
    start_page?: number;
    end_page?: number;
    description?: string;
  }) => libraryApi.put(`/time-periods/${timePeriodId}`, data),

  deleteTimePeriod: (timePeriodId: string) => libraryApi.delete(`/time-periods/${timePeriodId}`),

  generateCover: (bookId: string) => libraryApi.post<{ cover_image: string }>(`/books/${bookId}/generate-cover`),

  generateThumbnail: (bookId: string) => libraryApi.post<{ thumbnail: string }>(`/books/${bookId}/generate-thumbnail`),

  generateAllThumbnails: () => libraryApi.post<{ generated: number; failed: number; total: number }>('/books/generate-all-thumbnails'),

  quickSearch: (keyword: string, tag?: string) => 
    libraryApi.get<{ books: BookDocument[]; count: number; keyword: string; tag?: string }>('/books/quick-search', { 
      params: { keyword, ...(tag ? { tag } : {}) } 
    }),

  batchTag: (bookIds: string[], tag: string, mode: 'add' | 'replace' | 'remove' = 'add') =>
    libraryApi.post<{ updated_count: number; book_ids: string[]; tag: string; mode: string }>('/books/batch-tag', bookIds, {
      params: { tag, mode }
    }),

  updateReadingProgress: (bookId: string, currentPage: number, readingSeconds?: number) =>
    libraryApi.post<{
      success: boolean;
      last_read_page: number;
      last_read_time: string;
      total_reading_seconds: number;
      reading_speed_pages_per_hour: number | null;
    }>(`/books/${bookId}/reading-progress`, {
      current_page: currentPage,
      reading_seconds: readingSeconds || 0
    }),

  getRecentlyRead: (limit?: number) =>
    libraryApi.get<BookDocument[]>('/books/recently-read', {
      params: { limit: limit || 5 }
    }),

  getReadingStats: () =>
    libraryApi.get<{
      total_reading_hours: number;
      books_with_progress: number;
      average_reading_speed: number;
    }>('/reading-stats'),
};

export const worldTimelineApi = {
  getBookTimelineEvents: (bookId: string, sortBy?: string, order?: string) =>
    api.get<WorldTimelineEvent[]>(`/books/${bookId}/timeline-events`, {
      params: { sort_by: sortBy, order }
    }),

  createTimelineEvent: (bookId: string, data: CreateTimelineEventRequest) =>
    api.post<WorldTimelineEvent>(`/books/${bookId}/timeline-events`, data),

  updateTimelineEvent: (eventId: string, data: UpdateTimelineEventRequest) =>
    api.put<WorldTimelineEvent>(`/timeline-events/${eventId}`, data),

  deleteTimelineEvent: (eventId: string) =>
    api.delete(`/timeline-events/${eventId}`),

  getTimelineEvent: (eventId: string) =>
    api.get<WorldTimelineEvent>(`/timeline-events/${eventId}`),

  getLibraryTimelineSummary: () =>
    api.get<BookTimelineSummary[]>('/library/timeline-summary'),

  searchTimelineEvents: (params: {
    query?: string;
    book_id?: string;
    date_from?: string;
    date_to?: string;
    importance?: string;
  }) => api.get<WorldTimelineEvent[]>('/library/timeline-events/search', { params }),

  getAllTimelineEvents: () =>
    api.get<any[]>('/library/timeline-events/all'),

  // 文档时间笔记 API（通过 source_book_id 关联）
  getDocumentTimelineEvents: (documentId: string, sortBy?: string, order?: string) =>
    api.get<WorldTimelineEvent[]>(`/documents/${documentId}/timeline-events`, {
      params: { sort_by: sortBy, order }
    }),

  createDocumentTimelineEvent: (documentId: string, data: CreateTimelineEventRequest) =>
    api.post<WorldTimelineEvent>(`/documents/${documentId}/timeline-events`, data),

  // 直接关联到文档的时间笔记 API
  getDocumentDirectTimelineEvents: (documentId: string, sortBy?: string, order?: string) =>
    api.get<any[]>(`/documents/${documentId}/timeline-events`, {
      params: { sort_by: sortBy, order }
    }),

  createDocumentDirectTimelineEvent: (documentId: string, data: any) =>
    api.post<any>(`/documents/${documentId}/timeline-events`, data),

  updateDocumentDirectTimelineEvent: (eventId: string, data: any) =>
    api.put<any>(`/document-timeline-events/${eventId}`, data),

  deleteDocumentDirectTimelineEvent: (eventId: string) =>
    api.delete(`/document-timeline-events/${eventId}`),

  aiGenerateTimelineNotes: (documentId: string, customPrompt?: string, content?: string) =>
    api.post<{
      raw_output: string;
      parsed_events: Array<{
        event_date: string;
        event_date_display: string;
        event_title: string;
        event_description: string;
      }>;
      total_events: number;
    }>(`/documents/${documentId}/ai-generate-timeline-notes`, {
      custom_prompt: customPrompt,
      content: content
    }),

  aiGenerateTimelineNotesFromContent: (content: string, customPrompt?: string) =>
    api.post<{
      raw_output: string;
      parsed_events: Array<{
        event_date: string;
        event_date_display: string;
        event_title: string;
        event_description: string;
      }>;
      total_events: number;
    }>('/documents/ai-generate-timeline-notes-from-content', {
      content,
      custom_prompt: customPrompt
    }),

  saveTimelineNotesBatch: (documentId: string, events: Array<{
    event_date: string;
    event_date_display: string;
    event_title: string;
    event_description: string;
    tags?: string[];
  }>, defaultTags?: string[]) => {
    return api.post<{
      success: boolean;
      saved_count: number;
      events: Array<{
        id: string;
        event_date: string;
        event_date_display: string;
        event_title: string;
        event_description: string;
      }>;
    }>(`/documents/${documentId}/save-timeline-notes-batch`, {
      events,
      default_tags: defaultTags
    });
  },

  getTimelineTagsHistory: () =>
    api.get<{
      tags: string[];
      tags_with_count: Array<{
        tag: string;
        count: number;
      }>;
    }>('/documents/timeline-tags-history'),
};

export const documentSourceApi = {
  list: () => api.get<{
    sources: Array<{
      id: string;
      name: string;
      type: string;
      path: string;
      enabled: boolean;
      file_extensions: string[];
      auto_sync_on_startup: boolean;
    }>;
    sync_settings: {
      sync_on_startup: boolean;
      remove_orphans: boolean;
      update_existing: boolean;
    };
  }>('/document-sources'),

  sync: () => api.post<{
    total_scanned: number;
    books_added: number;
    books_existing: number;
    documents_added: number;
    documents_existing: number;
    errors: string[];
    sources: Array<{
      id: string;
      name: string;
      type: string;
      result: {
        scanned: number;
        books_added: number;
        books_existing: number;
        documents_added: number;
        documents_existing: number;
        errors: string[];
      };
    }>;
  }>('/document-sources/sync'),

  update: (sourceId: string, updates: Partial<{
    name: string;
    path: string;
    enabled: boolean;
    auto_sync_on_startup: boolean;
  }>) => api.put(`/document-sources/${sourceId}`, updates),

  add: (sourceData: {
    id: string;
    name: string;
    type: string;
    path: string;
    enabled?: boolean;
    file_extensions?: string[];
    auto_sync_on_startup?: boolean;
  }) => api.post('/document-sources', sourceData),

  remove: (sourceId: string) => api.delete(`/document-sources/${sourceId}`),
};

export const quarkApi = {
  getConfig: () => api.get<{
    has_cookie: boolean;
    cli_available: boolean;
    cookie_preview: string | null;
  }>('/quark/config'),

  setCookie: (cookie: string) => api.post('/quark/config/cookie', { cookie }),

  clearCookie: () => api.delete('/quark/config/cookie'),

  testConnection: () => api.get<{
    success: boolean;
    message: string;
    user_info: any | null;
  }>('/quark/test'),

  uploadBook: (bookId: string, options?: {
    remote_folder?: string;
    create_share?: boolean;
    share_expire?: number;
  }) => api.post<{
    success: boolean;
    message: string;
    book_id: string;
    share_url: string | null;
    share_password: string | null;
    file_id: string | null;
  }>('/quark/upload', {
    book_id: bookId,
    ...options
  }),

  uploadBatch: (bookIds: string[], options?: {
    remote_folder?: string;
    create_share?: boolean;
    share_expire?: number;
  }) => api.post<{
    results: Array<{
      book_id: string;
      success: boolean;
      message: string;
      share_url?: string;
      share_password?: string;
    }>;
  }>('/quark/upload-batch', bookIds, {
    params: options
  }),

  getBookStatus: (bookId: string) => api.get<{
    book_id: string;
    upload_status: string;
    share_url: string | null;
    file_id: string | null;
    upload_time: string | null;
  }>(`/quark/books/${bookId}/status`),

  refreshShare: (bookId: string, expire?: number) => api.post<{
    success: boolean;
    share_url: string;
    password: string | null;
  }>(`/quark/books/${bookId}/refresh-share`, null, {
    params: { expire }
  }),

  uploadByTag: (tag: string, options?: {
    book_ids?: string[];
    country_id?: string;
    remote_folder?: string;
    share_expire?: number;
    secondary_tag?: string;
  }) => api.post<{
    success: boolean;
    message: string;
    tag: string;
    secondary_tag?: string;
    folder_path: string;
    share_url: string | null;
    share_password: string | null;
    uploaded_count: number;
    failed_count: number;
    skipped_count: number;
    results: Array<{
      book_id: string;
      book_title: string;
      success: boolean;
      message: string;
      file_path?: string;
      skipped?: boolean;
    }>;
  }>('/quark/upload-by-tag', {
    tag,
    ...options
  }),

  getTagsSummary: (countryId?: string) => api.get<{
    tags: Array<{
      tag: string;
      total: number;
      uploaded: number;
      not_uploaded: number;
      book_ids: string[];
    }>;
  }>('/quark/tags/summary', {
    params: countryId ? { country_id: countryId } : undefined
  }),
};

export const duplicateApi = {
  checkDuplicate: (filePath: string, title: string, author?: string) => api.post<{
    is_duplicate: boolean;
    duplicate_type: string;
    existing_book_id: string | null;
    existing_book_title: string | null;
    similarity_score: number;
    details: Record<string, any>;
  }>('/duplicates/check', {
    file_path: filePath,
    title,
    author
  }),

  scanDuplicates: () => api.post<{
    total_scanned: number;
    exact_duplicates: number;
    content_duplicates: number;
    metadata_duplicates: number;
    duplicate_groups: Array<{
      group_id: string;
      books: Array<{
        id: string;
        title: string;
        author: string | null;
        file_path: string;
        is_primary: number;
      }>;
      primary_book_id: string;
    }>;
  }>('/duplicates/scan'),

  computeHashes: () => api.post<{
    total: number;
    processed: number;
    errors: Array<{
      book_id: string;
      title: string;
      error: string;
    }>;
  }>('/duplicates/compute-hashes'),

  getDuplicateGroups: () => api.get<{
    groups: Array<{
      group_id: string;
      books: Array<{
        id: string;
        title: string;
        author: string | null;
        file_path: string;
        file_size: number | null;
        is_primary: number;
        duplicate_status: string;
      }>;
      primary_book_id: string;
    }>;
  }>('/duplicates/groups'),

  resolveDuplicate: (primaryBookId: string, duplicateBookIds: string[], action?: string) => api.post<{
    success: boolean;
    message: string;
    primary_book_id: string;
  }>('/duplicates/resolve', null, {
    params: {
      primary_book_id: primaryBookId,
      duplicate_book_ids: duplicateBookIds.join(','),
      action: action || 'keep_primary'
    }
  }),

  deleteBook: (bookId: string, deleteFile?: boolean) => api.delete<{
    success: boolean;
    message: string;
  }>(`/duplicates/book/${bookId}`, {
    params: { delete_file: deleteFile || false }
  }),
};

export const pdfOcrApi = {
  checkStatus: (filePath: string) =>
    api.get<{
      has_text_layer: boolean;
      total_pages: number;
      needs_ocr: boolean;
    }>(`/pdf-ocr/status/${encodeURIComponent(filePath)}`),

  getLanguages: () =>
    api.get<{
      languages: Array<{
        code: string;
        name: string;
      }>;
    }>('/pdf-ocr/languages'),

  process: (data: {
    file_path: string;
    language?: string;
    deskew?: boolean;
    clean?: boolean;
    force_ocr?: boolean;
    backup?: boolean;
    in_place?: boolean;
  }) =>
    api.post<{
      success: boolean;
      output_path: string | null;
      error: string | null;
      pages_processed: number;
      had_ocr: boolean;
    }>('/pdf-ocr/process', data),

  processAsync: (filePath: string, options?: {
    language?: string;
    deskew?: boolean;
    backup?: boolean;
  }) =>
    api.post<{
      message: string;
      file_path: string;
      status: string;
    }>(`/pdf-ocr/process-async/${encodeURIComponent(filePath)}`, null, {
      params: options
    }),

  getTaskStatus: (filePath: string) =>
    api.get<{
      status: string;
      progress: number;
      error: string | null;
      result?: any;
    }>(`/pdf-ocr/task-status/${encodeURIComponent(filePath)}`),

  checkOcrmypdf: () =>
    api.get<{
      ocrmypdf_available: boolean;
      tesseract_path: string | null;
      tessdata_path: string | null;
    }>('/pdf-ocr/check-ocrmypdf'),

  getPaddleStatus: () =>
    api.get<{
      model_loaded: boolean;
      loading: boolean;
      error: string | null;
      device: string | null;
      gpu_available: boolean;
    }>('/pdf-ocr/paddle/status'),

  loadPaddleModel: () =>
    api.post<{
      message: string;
      status: any;
    }>('/pdf-ocr/paddle/load-model'),

  processPdfWithPaddle: (filePath: string, options?: {
    start_page?: number;
    end_page?: number;
  }) =>
    api.post<{
      success: boolean;
      text_content: string | null;
      error: string | null;
      pages: any[] | null;
      code_blocks: any[] | null;
      ocr_results: any[] | null;
    }>(`/pdf-ocr/paddle/process-pdf/${encodeURIComponent(filePath)}`, null, {
      params: options
    }),

  processPdfWithPaddleAsync: (filePath: string, options?: {
    start_page?: number;
    end_page?: number;
  }) =>
    api.post<{
      message: string;
      file_path: string;
      status: string;
    }>(`/pdf-ocr/paddle/process-pdf-async/${encodeURIComponent(filePath)}`, null, {
      params: options
    }),

  getPaddleTaskStatus: (filePath: string) =>
    api.get<{
      status: string;
      progress: number;
      error: string | null;
      result?: any;
    }>(`/pdf-ocr/paddle/task-status/${encodeURIComponent(filePath)}`),

  makeSearchableAsync: (filePath: string, options?: {
    start_page?: number;
    end_page?: number;
  }) =>
    api.post<{
      message: string;
      file_path: string;
      status: string;
    }>(`/pdf-ocr/paddle/make-searchable-async/${encodeURIComponent(filePath)}`, null, {
      params: options
    }),

  getMakeSearchableStatus: (filePath: string) =>
    api.get<{
      status: string;
      progress: number;
      current_page: number;
      total_pages: number;
      error: string | null;
      message: string;
      result?: any;
    }>(`/pdf-ocr/paddle/make-searchable-status/${encodeURIComponent(filePath)}`),

  extractTextAsync: (filePath: string, options?: {
    start_page?: number;
    end_page?: number;
    concurrency?: number;
  }) =>
    api.post<{
      message: string;
      file_path: string;
      status: string;
    }>(`/pdf-ocr/paddle/extract-text-async/${encodeURIComponent(filePath)}`, null, {
      params: options
    }),

  getExtractTextStatus: (filePath: string) =>
    api.get<{
      status: string;
      progress: number;
      current_page: number;
      total_pages: number;
      error: string | null;
      message: string;
      had_text: boolean;
      text_content: string | null;
      text_file_path: string | null;
      pages?: Array<{ page_number: number; text: string }>;
    }>(`/pdf-ocr/paddle/extract-text-status/${encodeURIComponent(filePath)}`),

  hasOcrText: (filePath: string) =>
    api.get<{
      has_ocr_text: boolean;
      text_file_path: string | null;
      file_size?: number;
      modified_time?: number;
    }>(`/pdf-ocr/paddle/has-ocr-text/${encodeURIComponent(filePath)}`),

  getOcrText: (filePath: string) =>
    api.get<string>(`/pdf-ocr/paddle/ocr-text/${encodeURIComponent(filePath)}`),

  getGpuStatus: () =>
    api.get<{
      gpu_utilization: number;
      memory_used: number;
      memory_total: number;
      memory_percent: number;
      concurrent_workers: number;
    }>('/pdf-ocr/paddle/gpu-status'),

  cancelOcr: (filePath: string) =>
    api.post<{
      success: boolean;
      message: string;
    }>(`/pdf-ocr/paddle/cancel-ocr/${encodeURIComponent(filePath)}`),

  getOcrProgress: (filePath: string) =>
    api.get<{
      last_processed_page: number;
      total_pages: number;
      has_progress: boolean;
    }>(`/pdf-ocr/paddle/ocr-progress/${encodeURIComponent(filePath)}`),

  saveOcrText: (filePath: string, textContent: string) =>
    api.post<{
      success: boolean;
      message: string;
      text_file_path: string;
    }>(`/pdf-ocr/paddle/save-ocr-text/${encodeURIComponent(filePath)}`, {
      text_content: textContent
    }),

  deleteOcrText: (filePath: string) =>
    api.delete<{
      success: boolean;
      message: string;
      files?: string[];
    }>(`/pdf-ocr/paddle/delete-ocr-text/${encodeURIComponent(filePath)}`),
};

export const backupApi = {
  list: () =>
    api.get<Array<{
      name: string;
      path: string | null;
      reason: string;
      timestamp: string;
      stats: Record<string, number>;
    }>>('/backup/list'),

  create: (reason?: string) =>
    api.post<{
      success: boolean;
      backup_path: string | null;
      timestamp: string | null;
      reason: string | null;
      stats: Record<string, number>;
      error: string | null;
    }>('/backup/create', null, {
      params: { reason: reason || 'manual' }
    }),

  restore: (backupName: string) =>
    api.post<{
      success: boolean;
      backup_name: string | null;
      restored_stats: Record<string, number>;
      previous_stats: Record<string, number>;
      error: string | null;
    }>(`/backup/restore/${encodeURIComponent(backupName)}`),

  checkIntegrity: () =>
    api.get<{
      healthy: boolean;
      current_stats: Record<string, number>;
      warnings: string[];
      recommendations: string[];
    }>('/backup/integrity'),

  emergencyRecovery: () =>
    api.post<{
      success: boolean;
      action: string | null;
      details: Record<string, any>;
      error: string | null;
    }>('/backup/emergency-recovery'),

  getStats: () =>
    api.get<{
      database: string;
      stats: Record<string, number>;
      backup_directory: string;
    }>('/backup/stats'),

  startScheduled: (intervalHours?: number) =>
    api.post<{
      success: boolean;
      message: string;
    }>('/backup/start-scheduled', null, {
      params: { interval_hours: intervalHours || 6 }
    }),

  stopScheduled: () =>
    api.post<{
      success: boolean;
      message: string;
    }>('/backup/stop-scheduled'),
};

export const dashboardApi = {
  getOverview: () =>
    api.get<{
      total_documents: number;
      total_books: number;
      today_notes: number;
      archived_books: number;
      unarchived_books: number;
    }>('/dashboard/overview'),

  getArchiveStatus: () =>
    api.get<{
      total: number;
      archived: number;
      unarchived: number;
    }>('/dashboard/archive-status'),

  getCountryDistribution: () =>
    api.get<Array<{
      name: string;
      value: number;
      id: string;
    }>>('/dashboard/country-distribution'),

  getTagsDistribution: () =>
    api.get<Array<{
      name: string;
      value: number;
    }>>('/dashboard/tags-distribution'),

  getActivityHeatmap: () =>
    api.get<Array<{
      date: string;
      count: number;
    }>>('/dashboard/activity-heatmap'),

  getUnarchivedTags: () =>
    api.get<Array<{
      name: string;
      count: number;
    }>>('/dashboard/unarchived-tags'),

  getMonthlyStats: () =>
    api.get<Array<{
      month: string;
      notes: number;
      documents: number;
    }>>('/dashboard/monthly-stats'),
};

export interface QuickNote {
  id: string;
  content: string;
  title: string | null;
  tags: string[] | null;
  group_id: string | null;
  group_name: string | null;
  source_document_id: string | null;
  source_page: number | null;
  source_type: string;
  is_processed: number;
  processed_at: string | null;
  converted_document_id: string | null;
  original_content: string | null;
  ai_processed: number;
  created_at: string;
  updated_at: string;
}

export interface QuickNoteCreateRequest {
  content: string;
  title?: string;
  tags?: string[];
  group_id?: string;
  group_name?: string;
  source_document_id?: string;
  source_page?: number;
  source_type?: string;
}

export interface QuickNoteAIResult {
  note_id: string;
  original_content: string;
  generated_title: string;
  optimized_content: string;
  suggested_tags: string[];
}

export const quickNoteApi = {
  create: (data: QuickNoteCreateRequest) =>
    api.post<QuickNote>('/quick-notes', data),

  list: (params?: {
    is_processed?: number;
    group_id?: string;
    source_document_id?: string;
    search?: string;
    skip?: number;
    limit?: number;
  }) => api.get<QuickNote[]>('/quick-notes', { params }),

  get: (id: string) =>
    api.get<QuickNote>(`/quick-notes/${id}`),

  update: (id: string, data: Partial<QuickNote>) =>
    api.put<QuickNote>(`/quick-notes/${id}`, data),

  delete: (id: string) =>
    api.delete(`/quick-notes/${id}`),

  batchDelete: (noteIds: string[]) =>
    api.post<{ deleted: number; total: number }>('/quick-notes/batch-delete', noteIds),

  getGroups: () =>
    api.get<{
      groups: Array<{
        id: string;
        name: string;
        count: number;
      }>;
    }>('/quick-notes/groups'),

  getStats: () =>
    api.get<{
      total: number;
      unprocessed: number;
      processed: number;
    }>('/quick-notes/stats'),

  batchProcess: (noteIds: string[], autoConvert?: boolean) =>
    api.post<{
      results: QuickNoteAIResult[];
      total: number;
      success: number;
      failed: number;
    }>('/quick-notes/batch-process', {
      note_ids: noteIds,
      auto_convert: autoConvert || false
    }),

  convertToDocument: (noteId: string) =>
    api.post<QuickNote>(`/quick-notes/${noteId}/convert`),

  createGroup: (groupName: string, noteIds?: string[]) =>
    api.post<{ group_id: string; group_name: string }>('/quick-notes/create-group', null, {
      params: { group_name: groupName, note_ids: noteIds?.join(',') }
    }),

  moveToGroup: (noteId: string, groupId?: string, groupName?: string) =>
    api.put<QuickNote>(`/quick-notes/${noteId}/move-to-group`, null, {
      params: { group_id: groupId, group_name: groupName }
    }),
};

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  completed: number;
  completed_at: string | null;
  task_type: string;
  target_value: number | null;
  current_value: number;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  due_date: string;
  task_type?: string;
  target_value?: number;
  priority?: string;
}

export const taskApi = {
  list: (includeCompleted?: boolean) =>
    api.get<Task[]>('/tasks', {
      params: { include_completed: includeCompleted || false }
    }),

  create: (data: TaskCreate) =>
    api.post<Task>('/tasks', data),

  update: (taskId: string, data: Partial<TaskCreate & { completed?: number; current_value?: number }>) =>
    api.put<Task>(`/tasks/${taskId}`, data),

  delete: (taskId: string) =>
    api.delete(`/tasks/${taskId}`),

  complete: (taskId: string) =>
    api.post<Task>(`/tasks/${taskId}/complete`),

  uncomplete: (taskId: string) =>
    api.post<Task>(`/tasks/${taskId}/uncomplete`),

  upcoming: (days?: number) =>
    api.get<Task[]>('/tasks/upcoming', {
      params: { days: days || 7 }
    }),

  overdue: () =>
    api.get<Task[]>('/tasks/overdue'),
};

export interface Activity {
  id: string;
  action_type: string;
  description: string;
  details: Record<string, any> | null;
  book_id: string | null;
  document_id: string | null;
  created_at: string;
}

export const activityApi = {
  list: (limit?: number) =>
    api.get<Activity[]>('/activity', {
      params: { limit: limit || 10 }
    }),

  stats: () =>
    api.get<{
      today_uploads: number;
      today_archives: number;
      today_notes: number;
      today_tags: number;
    }>('/activity/stats'),
};

export default api;
