import { libraryApi, libraryUploadApi } from './client';
import {
  Country,
  Category,
  TimePeriod,
  BookDocument,
  TimelineEntry,
  CountryCreateRequest,
  CategoryCreateRequest,
  TimePeriodCreateRequest,
} from '../types';

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
