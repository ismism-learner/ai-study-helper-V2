import { api } from './client';

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
    api.get<string>(`/pdf-ocr/paddle/ocr-text/${encodeURIComponent(filePath)}`, {
      params: { _t: Date.now() }
    }),

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
