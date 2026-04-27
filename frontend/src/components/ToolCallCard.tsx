import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface ToolCallData {
  toolName: string;
  toolId: string;
  arguments: Record<string, unknown>;
  result?: {
    success: boolean;
    result?: unknown;
    error?: string;
  };
  status: 'pending' | 'running' | 'completed' | 'error';
}

interface ToolCallCardProps {
  toolCall: ToolCallData;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  ocr_process_page: 'OCR识别页面',
  ocr_get_text: '获取OCR文本',
  ocr_get_status: '检查OCR状态',
  kg_create_node: '创建知识节点',
  kg_delete_node: '删除知识节点',
  kg_update_node: '更新知识节点',
  kg_search_nodes: '搜索知识节点',
  kg_create_edge: '创建知识关系',
  kg_delete_edge: '删除知识关系',
  kg_get_graph_data: '获取图谱数据',
  kg_get_statistics: '获取图谱统计',
  kg_clear_by_book: '清除书籍图谱',
  kg_auto_generate_from_text: '自动生成知识图谱',
  kg_quick_summary: '快速摘要',
  doc_generate_framework: '生成文档正文',
  doc_optimize_paragraph: '优化段落',
  doc_polish_note: '润色笔记',
  doc_generate_chapter_note: '生成章节笔记',
};

const TOOL_ICONS: Record<string, string> = {
  ocr_: '📄',
  kg_: '🔗',
  doc_: '📝',
};

function getToolIcon(name: string): string {
  for (const [prefix, icon] of Object.entries(TOOL_ICONS)) {
    if (name.startsWith(prefix)) return icon;
  }
  return '🔧';
}

function formatArguments(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '无参数';
  return entries
    .map(([key, value]) => {
      const val = typeof value === 'string'
        ? value.length > 80 ? value.slice(0, 80) + '...' : value
        : JSON.stringify(value);
      return `${key}: ${val}`;
    })
    .join('\n');
}

function formatResult(result: unknown): string {
  if (!result) return '无返回值';
  const str = JSON.stringify(result, null, 2);
  return str.length > 500 ? str.slice(0, 500) + '...' : str;
}

const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);

  const displayName = TOOL_DISPLAY_NAMES[toolCall.toolName] || toolCall.toolName;
  const icon = getToolIcon(toolCall.toolName);

  const statusConfig = {
    pending: { color: 'var(--text-muted)', icon: <Wrench size={12} />, label: '等待中' },
    running: { color: 'var(--accent-blue, #3b82f6)', icon: <Loader2 size={12} className="cc-tool-spin" />, label: '执行中' },
    completed: { color: 'var(--accent-green, #22c55e)', icon: <CheckCircle2 size={12} />, label: '完成' },
    error: { color: 'var(--accent-red, #ef4444)', icon: <XCircle size={12} />, label: '失败' },
  };

  const status = statusConfig[toolCall.status];

  return (
    <div className="cc-tool-call-card">
      <div className="cc-tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="cc-tool-call-expand">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="cc-tool-call-icon">{icon}</span>
        <span className="cc-tool-call-name">{displayName}</span>
        <span className="cc-tool-call-status" style={{ color: status.color }}>
          {status.icon}
          <span className="cc-tool-call-status-text">{status.label}</span>
        </span>
      </div>

      {expanded && (
        <div className="cc-tool-call-body">
          <div className="cc-tool-call-section">
            <div className="cc-tool-call-section-title">参数</div>
            <pre className="cc-tool-call-args">{formatArguments(toolCall.arguments)}</pre>
          </div>
          {toolCall.result && (
            <div className="cc-tool-call-section">
              <div className="cc-tool-call-section-title">
                {toolCall.result.success ? '结果' : '错误'}
              </div>
              <pre className={`cc-tool-call-result ${toolCall.result.success ? '' : 'cc-tool-call-error'}`}>
                {toolCall.result.error
                  ? toolCall.result.error
                  : formatResult(toolCall.result.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(ToolCallCard);
