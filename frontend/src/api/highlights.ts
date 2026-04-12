import { api } from './client';
import { Highlight, CreateHighlightRequest, ExplainRequest } from '../types';

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
