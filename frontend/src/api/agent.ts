import { api } from './client';

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: AgentToolCall[];
}

export interface AgentToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentChatRequest {
  messages: AgentMessage[];
  book_id?: string;
  book_title?: string;
  source_doc_id?: string;
  chapter_index?: number;
  ocr_text?: string;
}

export interface AgentChatResponse {
  message: string;
  tool_calls: AgentToolCallRecord[];
  total_rounds: number;
}

export interface AgentToolCallRecord {
  tool_call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const agentApi = {
  /** Agent对话（非流式） */
  chat: (data: AgentChatRequest) =>
    api.post<AgentChatResponse>('/agent/chat', data),

  /** Agent对话流式SSE端点URL */
  chatStreamUrl: '/api/agent/chat/stream',

  /** 列出所有可用Agent工具 */
  getTools: () =>
    api.get<{ total: number; tools: AgentToolDefinition[] }>('/agent/tools'),
};
