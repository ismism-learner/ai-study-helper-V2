import { api } from './client';

export const folderApi = {
  list: () => api.get<any[]>('/folders'),

  create: (name: string, parentId?: string) =>
    api.post('/folders', { name, parent_id: parentId }),

  update: (id: string, data: { name?: string; parent_id?: string }) =>
    api.put(`/folders/${id}`, data),

  delete: (id: string) => api.delete(`/folders/${id}`),
};
