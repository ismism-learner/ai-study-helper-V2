import { api, uploadApi } from './client';
import { Document, CreateDocumentRequest } from '../types';

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
