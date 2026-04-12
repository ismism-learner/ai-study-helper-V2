import { api } from './client';

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
