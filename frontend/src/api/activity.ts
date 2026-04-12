import { api } from './client';

export interface Activity {
  id: string;
  action_type: string;
  description: string;
  details: Record<string, any> | null;
  book_id: string | null;
  document_id: string | null;
  created_at: string;
}

export const activityApi = {
  list: (limit?: number) =>
    api.get<Activity[]>('/activity', {
      params: { limit: limit || 10 }
    }),

  stats: () =>
    api.get<{
      today_uploads: number;
      today_archives: number;
      today_notes: number;
      today_tags: number;
    }>('/activity/stats'),
};
