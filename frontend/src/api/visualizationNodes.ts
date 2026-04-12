/**
 * 可视化节点API客户端
 * 处理节点的创建、规范化、位置保存等
 */
import { api } from './client';

export interface VisualizationNode {
  id: string;
  book_id: string | null;
  chapter_note_id: string | null;
  node_type: 'formula' | 'code' | 'chart' | 'geometry';
  title: string;
  description: string | null;
  source_content: string;
  normalized_content: string | null;
  render_config: Record<string, unknown> | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  connections: Array<{ target_id: string; type: string; label?: string }> | null;
  language: string | null;
  confidence: 'high' | 'medium';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateNodeRequest {
  book_id?: string;
  chapter_note_id?: string;
  node_type: 'formula' | 'code' | 'chart' | 'geometry';
  title: string;
  description?: string;
  source_content: string;
  language?: string;
  confidence?: 'high' | 'medium';
}

export interface UpdateNodeRequest {
  title?: string;
  description?: string;
  position?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  connections?: Array<{ target_id: string; type: string; label?: string }>;
  is_active?: boolean;
}

export interface NormalizeResult {
  normalized_content: string;
  render_config: Record<string, unknown>;
  description: string;
}

/**
 * AI规范化处理代码块
 */
export async function normalizeContent(
  sourceContent: string,
  nodeType: string,
  language?: string
): Promise<NormalizeResult> {
  const response = await api.post<{ success: boolean; result: NormalizeResult }>(
    '/visualization-nodes/normalize',
    {
      source_content: sourceContent,
      node_type: nodeType,
      language,
    }
  );
  return response.data.result;
}

/**
 * 创建新节点
 */
export async function createNode(request: CreateNodeRequest): Promise<VisualizationNode> {
  const response = await api.post<VisualizationNode>('/visualization-nodes/', request);
  return response.data;
}

/**
 * 对现有节点进行AI规范化
 */
export async function normalizeNode(nodeId: string): Promise<VisualizationNode> {
  const response = await api.post<VisualizationNode>(`/visualization-nodes/${nodeId}/normalize`);
  return response.data;
}

/**
 * 获取节点列表
 */
export async function listNodes(params?: {
  book_id?: string;
  chapter_note_id?: string;
  is_active?: boolean;
}): Promise<VisualizationNode[]> {
  const response = await api.get<VisualizationNode[]>('/visualization-nodes/', { params });
  return response.data;
}

/**
 * 更新节点
 */
export async function updateNode(nodeId: string, request: UpdateNodeRequest): Promise<VisualizationNode> {
  const response = await api.patch<VisualizationNode>(`/visualization-nodes/${nodeId}`, request);
  return response.data;
}

/**
 * 删除节点
 */
export async function deleteNode(nodeId: string): Promise<void> {
  await api.delete(`/visualization-nodes/${nodeId}`);
}

/**
 * 批量保存节点位置
 */
export async function batchSaveNodes(nodes: Array<{
  id: string;
  position?: { x: number; y: number; width?: number; height?: number };
  connections?: Array<{ target_id: string; type: string; label?: string }>;
  is_active?: boolean;
}>): Promise<void> {
  await api.post('/visualization-nodes/batch-save', nodes);
}

export default {
  normalizeContent,
  createNode,
  normalizeNode,
  listNodes,
  updateNode,
  deleteNode,
  batchSaveNodes,
};
