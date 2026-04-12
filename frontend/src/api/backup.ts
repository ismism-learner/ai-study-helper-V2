import { api } from './client';

export const backupApi = {
  list: () =>
    api.get<Array<{
      name: string;
      path: string | null;
      reason: string;
      timestamp: string;
      stats: Record<string, number>;
    }>>('/backup/list'),

  create: (reason?: string) =>
    api.post<{
      success: boolean;
      backup_path: string | null;
      timestamp: string | null;
      reason: string | null;
      stats: Record<string, number>;
      error: string | null;
    }>('/backup/create', null, {
      params: { reason: reason || 'manual' }
    }),

  restore: (backupName: string) =>
    api.post<{
      success: boolean;
      backup_name: string | null;
      restored_stats: Record<string, number>;
      previous_stats: Record<string, number>;
      error: string | null;
    }>(`/backup/restore/${encodeURIComponent(backupName)}`),

  checkIntegrity: () =>
    api.get<{
      healthy: boolean;
      current_stats: Record<string, number>;
      warnings: string[];
      recommendations: string[];
    }>('/backup/integrity'),

  emergencyRecovery: () =>
    api.post<{
      success: boolean;
      action: string | null;
      details: Record<string, any>;
      error: string | null;
    }>('/backup/emergency-recovery'),

  getStats: () =>
    api.get<{
      database: string;
      stats: Record<string, number>;
      backup_directory: string;
    }>('/backup/stats'),

  startScheduled: (intervalHours?: number) =>
    api.post<{
      success: boolean;
      message: string;
    }>('/backup/start-scheduled', null, {
      params: { interval_hours: intervalHours || 6 }
    }),

  stopScheduled: () =>
    api.post<{
      success: boolean;
      message: string;
    }>('/backup/stop-scheduled'),
};
