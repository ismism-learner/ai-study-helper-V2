import { api } from './client';

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
