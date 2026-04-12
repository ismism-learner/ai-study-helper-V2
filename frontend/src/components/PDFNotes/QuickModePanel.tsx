import React from 'react';
import { Send, RefreshCw, Check, X, Sparkles, Calendar, CheckSquare, Square, Plus, BookOpen, Trash2 } from 'lucide-react';
import { QuickNote } from '../../api';
import { PDFNote } from './types';

interface QuickModePanelProps {
  quickNotes: QuickNote[];
  allUnprocessedQuickNotes: QuickNote[];
  selectedQuickNotes: Set<string>;
  quickContent: string;
  isSavingQuick: boolean;
  isBatchPolishing: boolean;
  polishResults: any[] | null;
  isGeneratingTimeline: boolean;
  onQuickContentChange: (content: string) => void;
  onQuickSave: () => void;
  onNewQuickNote: () => void;
  onSelectQuickNote: (noteId: string) => void;
  onSelectAllQuickNotes: () => void;
  onBatchPolish: () => void;
  onBatchTimelineGenerate: () => void;
  onDeleteQuickNote: (noteId: string) => void;
  onNoteClick?: (note: PDFNote) => void;
  onClearPolishResults: () => void;
}

export const QuickModePanel: React.FC<QuickModePanelProps> = ({
  quickNotes,
  allUnprocessedQuickNotes,
  selectedQuickNotes,
  quickContent,
  isSavingQuick,
  isBatchPolishing,
  polishResults,
  isGeneratingTimeline,
  onQuickContentChange,
  onQuickSave,
  onNewQuickNote,
  onSelectQuickNote,
  onSelectAllQuickNotes,
  onBatchPolish,
  onBatchTimelineGenerate,
  onDeleteQuickNote,
  onNoteClick,
  onClearPolishResults,
}) => {
  const handleQuickKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onQuickSave();
    }
  };

  return (
    <div className="quick-mode-container">
      {quickNotes.length > 0 && (
        <div className="quick-notes-list">
          <div className="batch-actions-bar">
            <button
              onClick={onSelectAllQuickNotes}
              className="select-all-btn"
            >
              {selectedQuickNotes.size === allUnprocessedQuickNotes.length ? (
                <CheckSquare size={14} />
              ) : (
                <Square size={14} />
              )}
              {selectedQuickNotes.size === allUnprocessedQuickNotes.length ? '取消全选' : '全选'}
            </button>
            <span className="note-count">
              已选 {selectedQuickNotes.size} / {allUnprocessedQuickNotes.length}
            </span>
            {selectedQuickNotes.size > 0 && (
              <>
                <button
                  onClick={onBatchPolish}
                  disabled={isBatchPolishing}
                  className="batch-polish-btn"
                >
                  <Sparkles size={14} />
                  {isBatchPolishing ? '润色中...' : '批量润色'}
                </button>
                <button
                  onClick={onBatchTimelineGenerate}
                  disabled={isGeneratingTimeline}
                  className="batch-timeline-btn"
                  title="批量生成时间笔记"
                >
                  <Calendar size={14} />
                  {isGeneratingTimeline ? '生成中...' : '时间笔记'}
                </button>
              </>
            )}
            <button
              onClick={onNewQuickNote}
              className="new-quick-note-btn"
            >
              <Plus size={14} />
              新笔记
            </button>
          </div>
          {quickNotes.map((qn) => (
            <div 
              key={qn.id}
              className={`quick-note-item ${selectedQuickNotes.has(qn.id) ? 'selected' : ''}`}
              onClick={() => onSelectQuickNote(qn.id)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectQuickNote(qn.id);
                }}
                className="select-all-btn"
              >
                {selectedQuickNotes.has(qn.id) ? (
                  <CheckSquare size={16} />
                ) : (
                  <Square size={16} />
                )}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="note-time-badge">
                    {new Date(qn.created_at).toLocaleTimeString()}
                  </span>
                  {qn.source_page && (
                    <span className="note-page-badge">
                      第 {qn.source_page} 页
                    </span>
                  )}
                  {qn.is_processed === 1 && (
                    <span className="note-converted-badge">
                      已转换
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {qn.content.substring(0, 100)}
                  {qn.content.length > 100 ? '...' : ''}
                </div>
                {qn.is_processed === 1 && qn.converted_document_id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNoteClick && qn.source_page) {
                        onNoteClick({
                          id: qn.converted_document_id!,
                          title: qn.title || '',
                          content: qn.content,
                          page_number: qn.source_page,
                          created_at: qn.created_at,
                          tags: qn.tags || [],
                        });
                      }
                    }}
                    className="note-jump-btn"
                  >
                    <BookOpen size={12} />
                    跳转到第 {qn.source_page} 页
                  </button>
                )}
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm('确定删除此笔记？')) {
                    onDeleteQuickNote(qn.id);
                  }
                }}
                className="note-delete-btn"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {polishResults && polishResults.length > 0 && (
        <div className="polish-results-panel">
          <div className="polish-results-header">
            <span className="polish-results-title">
              <Check size={14} />
              润色完成 ({polishResults.length} 条)
            </span>
            <button
              onClick={onClearPolishResults}
              className="polish-results-close"
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--success-500)' }}>
            笔记已润色并转换为标准笔记，可在标准模式中查看
          </div>
        </div>
      )}

      <div className="quick-input-area">
        <textarea
          value={quickContent}
          onChange={(e) => onQuickContentChange(e.target.value)}
          onKeyDown={handleQuickKeyDown}
          placeholder="输入笔记内容，Ctrl+Enter 保存..."
          rows={4}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Ctrl+Enter 快速保存
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onQuickSave}
              disabled={!quickContent.trim() || isSavingQuick}
              className="quick-save-btn"
            >
              {isSavingQuick ? (
                <>
                  <RefreshCw size={14} className="spinning" />
                  保存中...
                </>
              ) : (
                <>
                  <Send size={14} />
                  保存
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
