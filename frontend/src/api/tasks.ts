import { api } from './client';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  completed: number;
  completed_at: string | null;
  task_type: string;
  target_value: number | null;
  current_value: number;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  due_date: string;
  task_type?: string;
  target_value?: number;
  priority?: string;
}

export const taskApi = {
  list: (includeCompleted?: boolean) =>
    api.get<Task[]>('/tasks', {
      params: { include_completed: includeCompleted || false }
    }),

  create: (data: TaskCreate) =>
    api.post<Task>('/tasks', data),

  update: (taskId: string, data: Partial<TaskCreate & { completed?: number; current_value?: number }>) =>
    api.put<Task>(`/tasks/${taskId}`, data),

  delete: (taskId: string) =>
    api.delete(`/tasks/${taskId}`),

  complete: (taskId: string) =>
    api.post<Task>(`/tasks/${taskId}/complete`),

  uncomplete: (taskId: string) =>
    api.post<Task>(`/tasks/${taskId}/uncomplete`),

  upcoming: (days?: number) =>
    api.get<Task[]>('/tasks/upcoming', {
      params: { days: days || 7 }
    }),

  overdue: () =>
    api.get<Task[]>('/tasks/overdue'),
};
