import { api } from './client';

export interface ChapterNote {
  id: string;
  book_id: string | null;
  document_id: string | null;
  chapter_title: string;
  original_text: string;
  markdown_content: string | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  start_page: number | null;
  end_page: number | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterNoteCreateRequest {
  book_id?: string;
  document_id?: string;
  chapter_title: string;
  original_text: string;
  start_page?: number;
  end_page?: number;
  tags?: string[];
}

export interface ChapterNoteGenerateRequest {
  original_text: string;
  chapter_title?: string;
}

export interface StructureGenerateRequest {
  original_text: string;
  chapter_title?: string;
}

export interface SectionGenerateRequest {
  section_text: string;
  section_info: {
    title?: string;
    summary?: string;
    start_line?: number;
    end_line?: number;
    sections?: { title: string; summary: string; key_points?: string[]; start_line?: number; end_line?: number }[];
    [key: string]: unknown;
  };
  structure: {
    book_title?: string;
    total_chapters?: number;
    chapters: { index: number; title: string; summary?: string; start_line?: number; end_line?: number; sections?: { title: string; summary: string; key_points?: string[]; start_line?: number; end_line?: number }[] }[];
    [key: string]: unknown;
  };
  chapter_title?: string;
}

export interface SplitByStructureRequest {
  original_text: string;
  structure: SectionGenerateRequest['structure'];
}

export interface SplitSection {
  index: number;
  title: string;
  text: string;
  section_info: SectionGenerateRequest['section_info'];
}

export const chapterNoteApi = {
  create: (data: ChapterNoteCreateRequest) =>
    api.post<ChapterNote>('/chapter-notes', data),

  list: (params?: {
    book_id?: string;
    document_id?: string;
    status?: string;
    skip?: number;
    limit?: number;
  }) => api.get<ChapterNote[]>('/chapter-notes', { params }),

  get: (id: string) =>
    api.get<ChapterNote>(`/chapter-notes/${id}`),

  update: (id: string, data: Partial<ChapterNote>) =>
    api.put<ChapterNote>(`/chapter-notes/${id}`, data),

  delete: (id: string) =>
    api.delete(`/chapter-notes/${id}`),

  generate: (data: ChapterNoteGenerateRequest) =>
    api.post<{ markdown_content: string }>('/chapter-notes/generate', data),

  generateStructure: (data: StructureGenerateRequest) =>
    api.post<{ structure: SectionGenerateRequest['structure'] }>('/chapter-notes/generate-structure', data),

  generateSection: (data: SectionGenerateRequest) =>
    api.post<{ markdown_content: string }>('/chapter-notes/generate-section', data),

  splitByStructure: (data: SplitByStructureRequest) =>
    api.post<{ sections: SplitSection[] }>('/chapter-notes/split-by-structure', data),

  generateAndSave: (noteId: string) =>
    api.post<ChapterNote>(`/chapter-notes/${noteId}/generate`),

  export: (params?: { book_id?: string; document_id?: string }) =>
    api.post<{ content: string; chapter_count: number }>('/chapter-notes/export', null, { params }),
};
