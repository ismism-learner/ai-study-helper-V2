import { api } from './client';

export const dashboardApi = {
  getOverview: () =>
    api.get<{
      total_documents: number;
      total_books: number;
      today_notes: number;
      archived_books: number;
      unarchived_books: number;
    }>('/dashboard/overview'),

  getArchiveStatus: () =>
    api.get<{
      total: number;
      archived: number;
      unarchived: number;
    }>('/dashboard/archive-status'),

  getCountryDistribution: () =>
    api.get<Array<{
      name: string;
      value: number;
      id: string;
    }>>('/dashboard/country-distribution'),

  getTagsDistribution: () =>
    api.get<Array<{
      name: string;
      value: number;
    }>>('/dashboard/tags-distribution'),

  getActivityHeatmap: () =>
    api.get<Array<{
      date: string;
      count: number;
    }>>('/dashboard/activity-heatmap'),

  getUnarchivedTags: () =>
    api.get<Array<{
      name: string;
      count: number;
    }>>('/dashboard/unarchived-tags'),

  getMonthlyStats: () =>
    api.get<Array<{
      month: string;
      notes: number;
      documents: number;
    }>>('/dashboard/monthly-stats'),
};
