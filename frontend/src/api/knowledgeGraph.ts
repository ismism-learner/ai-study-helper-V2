import { api } from './client';

export const knowledgeGraphApi = {
  healthCheck: () => api.get('/knowledge-graph/health'),

  listBooks: () => api.get('/knowledge-graph/books'),

  getBookEntities: (title: string) =>
    api.get(`/knowledge-graph/books/${encodeURIComponent(title)}/entities`),

  searchEntities: (data: { keyword: string; entity_type?: string; limit?: number }) =>
    api.post('/knowledge-graph/search', data),

  semanticSearch: (data: { query: string; entity_type?: string; top_k?: number }) =>
    api.post('/knowledge-graph/search/semantic', data),

  getEntityDetail: (entityName: string) =>
    api.get(`/knowledge-graph/entities/${encodeURIComponent(entityName)}`),

  getConceptNetwork: (conceptName: string, depth: number = 2) =>
    api.get(`/knowledge-graph/concepts/${encodeURIComponent(conceptName)}/network`, { params: { depth } }),

  getGraphData: (bookTitle?: string) =>
    api.get('/knowledge-graph/graph-data', { params: bookTitle ? { book_title: bookTitle } : {} }),

  getGraphDataByTag: (tag: string) =>
    api.get(`/knowledge-graph/by-tag/${encodeURIComponent(tag)}`),

  getStatistics: () => api.get('/knowledge-graph/statistics'),

  createQuickSummary: (data: { text: string; book_id: string; book_title: string; chapter_index?: number; text_position: number }) =>
    api.post('/knowledge-graph/quick-summary', data),

  createDetailedQuestion: (data: { text: string; book_id: string; book_title: string; chapter_index?: number; text_position: number }) =>
    api.post('/knowledge-graph/detailed-question', data),

  deleteNode: (nodeId: string) =>
    api.delete(`/knowledge-graph/nodes/${nodeId}`),

  updateNode: (nodeId: string, data: { name?: string; description?: string }) =>
    api.put(`/knowledge-graph/nodes/${nodeId}`, data),
};

export const cognitiveChainApi = {
  createChain: (data: { root_concept: string; context?: string; user_id?: string; source_doc_id?: string; source_doc_title?: string; source_chapter_index?: number; source_knowledge_node_id?: string }) =>
    api.post('/cognitive-chains/create', data),

  createChainStream: (_params: { root_concept: string; context?: string; user_id?: string; source_doc_id?: string; source_doc_title?: string; source_chapter_index?: number; source_knowledge_node_id?: string }) =>
    `/api/cognitive-chains/create/stream`,

  expandChain: (data: { chain_id: string; parent_node_id: string; concept_to_explain: string; context?: string; source_doc_id?: string; source_doc_title?: string; source_chapter_index?: number; source_knowledge_node_id?: string }) =>
    api.post('/cognitive-chains/expand', data),

  explainConcept: (data: { concept: string; context?: string }) =>
    api.post('/cognitive-chains/explain', data),

  getChain: (chainId: string) =>
    api.get(`/cognitive-chains/${chainId}`),

  getUserChains: (userId: string, limit: number = 20) =>
    api.get(`/cognitive-chains/user/${userId}`, { params: { limit } }),

  getChainsBySourceDoc: (sourceDocId: string, limit: number = 50) =>
    api.get(`/cognitive-chains/source-doc/${sourceDocId}`, { params: { limit } }),

  deleteChain: (chainId: string) =>
    api.delete(`/cognitive-chains/${chainId}`),

  findChainsByConcept: (conceptName: string, limit: number = 10) =>
    api.get(`/cognitive-chains/by-concept/${encodeURIComponent(conceptName)}`, { params: { limit } }),
};
