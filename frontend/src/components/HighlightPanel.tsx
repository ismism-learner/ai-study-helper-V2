import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight } from '../types';
import { highlightApi } from '../api';
import { Sparkles, Trash2, ChevronDown, ChevronUp, Edit3, Clock } from 'lucide-react';
import TimelineNoteModal from './TimelineNoteModal';

interface HighlightPanelProps {
  highlights: Highlight[];
  onHighlightDeleted: (id: string) => void;
  onExplanationGenerated: (highlight: Highlight) => void;
  isDeleteMode?: boolean;
  setIsDeleteMode?: (value: boolean) => void;
  showDeleteModeButton?: boolean;
  documentId?: string;
  onTimelineEventAdded?: () => void;
  onTimelineEventUpdated?: () => void;
  currentPage?: number;
}

const HighlightPanel: React.FC<HighlightPanelProps> = ({
  highlights,
  onHighlightDeleted,
  onExplanationGenerated,
  isDeleteMode = false,
  setIsDeleteMode,
  showDeleteModeButton = false,
  documentId,
  onTimelineEventAdded = () => {},
  onTimelineEventUpdated = () => {},
  currentPage = 1,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isTimelineNoteModalOpen, setIsTimelineNoteModalOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!isHovering) {
      e.preventDefault();
      window.scrollTo({
        top: window.scrollY + e.deltaY,
        behavior: 'auto'
      });
    }
  }, [isHovering]);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      panel.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        panel.removeEventListener('wheel', handleWheel);
      };
    }
  }, [handleWheel]);

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const handleExplain = async (highlight: Highlight) => {
    setLoadingId(highlight.id);
    try {
      const response = await highlightApi.explain({
        highlight_id: highlight.id,
      });
      
      onExplanationGenerated({
        ...highlight,
        explanation: response.data.explanation,
      });
      setExpandedId(highlight.id);
    } catch (error) {
      console.error('Failed to generate explanation:', error);
      alert('生成解释失败，请重试');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这个高亮标记吗？')) return;
    
    try {
      await highlightApi.delete(id);
      onHighlightDeleted(id);
    } catch (error) {
      console.error('Failed to delete highlight:', error);
      alert('删除失败，请重试');
    }
  };

  return (
    <div 
      className="highlight-panel-container"
      ref={panelRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="highlight-panel-header">
        <h3 style={{ margin: 0 }}>高亮标记</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setIsTimelineNoteModalOpen(true)}
            style={{ padding: '6px 12px', fontSize: 13 }}
            disabled={!documentId}
          >
            <Clock size={14} style={{ marginRight: 4 }} />
            添加时间笔记
          </button>
          {showDeleteModeButton && setIsDeleteMode && (
            <button
              className={`btn ${isDeleteMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setIsDeleteMode(!isDeleteMode)}
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              <Edit3 size={14} style={{ marginRight: 4 }} />
              {isDeleteMode ? '退出删改' : '删改模式'}
            </button>
          )}
        </div>
      </div>

      {highlights.length === 0 ? (
        <p style={{ color: '#6c757d', textAlign: 'center', padding: '20px 0' }}>
          暂无高亮标记，请在文档中选中文本后点击"高亮标记"按钮
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {highlights.map((highlight) => (
            <div
              key={highlight.id}
              id={`explanation-${highlight.id}`}
              style={{
                border: '1px solid #e9ecef',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  background: highlight.explanation ? '#f8f9fa' : '#fff3cd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(expandedId === highlight.id ? null : highlight.id)}
              >
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500, color: '#495057' }}>
                    "{highlight.highlighted_text.substring(0, 50)}
                    {highlight.highlighted_text.length > 50 ? '...' : ''}"
                  </span>
                  {highlight.explanation && (
                    <span
                      style={{
                        marginLeft: 8,
                        padding: '2px 8px',
                        background: '#28a745',
                        color: 'white',
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    >
                      已解释
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {expandedId === highlight.id ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </div>
              </div>

              {expandedId === highlight.id && (
                <div style={{ padding: 16, borderTop: '1px solid #e9ecef' }}>
                  {highlight.explanation ? (
                    <div className="explanation-panel">
                      <h3>AI 解释</h3>
                      <div className="explanation-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {highlight.explanation}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                      <p style={{ color: '#6c757d', marginBottom: 16 }}>
                        点击下方按钮生成AI解释
                      </p>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleExplain(highlight)}
                        disabled={loadingId === highlight.id}
                      >
                        {loadingId === highlight.id ? (
                          <>
                            <span className="loading-spinner" /> 生成中...
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} style={{ marginRight: 6 }} />
                            生成解释
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 16,
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 8,
                    }}
                  >
                    {highlight.explanation && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleExplain(highlight)}
                        disabled={loadingId === highlight.id}
                      >
                        重新生成
                      </button>
                    )}
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete(highlight.id)}
                    >
                      <Trash2 size={16} style={{ marginRight: 4 }} />
                      删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <TimelineNoteModal
        isOpen={isTimelineNoteModalOpen}
        onClose={() => setIsTimelineNoteModalOpen(false)}
        onEventAdded={() => {
          onTimelineEventAdded();
          // 触发自定义事件通知 DocumentTimelineNotes 刷新
          window.dispatchEvent(new CustomEvent('timeline-note-added'));
        }}
        onEventUpdated={() => {
          onTimelineEventUpdated();
          // 触发自定义事件通知 DocumentTimelineNotes 刷新
          window.dispatchEvent(new CustomEvent('timeline-note-updated'));
        }}
        documentId={documentId}
        currentPage={currentPage}
      />
    </div>
  );
};

export default HighlightPanel;
