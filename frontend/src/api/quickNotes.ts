import { api } from './client';

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
    source_page?: number;
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
