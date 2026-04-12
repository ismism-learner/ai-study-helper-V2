import { api } from './client';
import { ParagraphOptimizeResponse } from '../types';

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
