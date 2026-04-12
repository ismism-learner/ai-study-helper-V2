import { api } from './client';
import {
  WorldTimelineEvent,
  CreateTimelineEventRequest,
  UpdateTimelineEventRequest,
  BookTimelineSummary,
} from '../types';

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

  getDocumentTimelineEvents: (documentId: string, sortBy?: string, order?: string) =>
    api.get<WorldTimelineEvent[]>(`/documents/${documentId}/timeline-events`, {
      params: { sort_by: sortBy, order }
    }),

  createDocumentTimelineEvent: (documentId: string, data: CreateTimelineEventRequest) =>
    api.post<WorldTimelineEvent>(`/documents/${documentId}/timeline-events`, data),

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
