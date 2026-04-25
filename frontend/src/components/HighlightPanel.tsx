import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight } from '../types';
import { highlightApi } from '../api';
import { Sparkles, Trash2, ChevronDown, ChevronUp, Edit3, Clock } from 'lucide-react';
import TimelineNoteModal from './TimelineNoteModal';
import LoadingBook from './LoadingBook';

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
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ 
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            color: 'white',
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 600
          }}>
            高亮
          </span>
          <span>标记</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 'normal',
            color: 'var(--text-muted)',
            background: 'var(--bg-light)',
            padding: '1px 6px',
            borderRadius: '8px'
          }}>
            {highlights.length}
          </span>
        </h3>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setIsTimelineNoteModalOpen(true)}
            disabled={!documentId}
            title="添加时间笔记"
          >
            <Clock size={12} />
          </button>
          {showDeleteModeButton && setIsDeleteMode && (
            <button
              className={`btn ${isDeleteMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setIsDeleteMode(!isDeleteMode)}
              title={isDeleteMode ? '退出删改模式' : '删改模式'}
            >
              <Edit3 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="panel-content-scrollable" style={{ padding: 10, overflowY: 'auto' }}>
        {highlights.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontSize: 12 }}>
            暂无高亮标记
          </p>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {highlights.map((highlight) => (
            <div
              key={highlight.id}
              id={`explanation-${highlight.id}`}
              className="highlight-item-card"
            >
              <div
                className={`highlight-item-header ${highlight.explanation ? 'has-explanation' : ''}`}
                onClick={() => setExpandedId(expandedId === highlight.id ? null : highlight.id)}
              >
                <div style={{ flex: 1 }}>
                  <span className="highlight-text-preview">
                    "{highlight.highlighted_text.substring(0, 50)}
                    {highlight.highlighted_text.length > 50 ? '...' : ''}"
                  </span>
                  {highlight.explanation && (
                    <span className="explanation-badge">
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
                <div className="highlight-item-content">
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
                    <div className="explanation-placeholder">
                      <p>点击下方按钮生成AI解释</p>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleExplain(highlight)}
                        disabled={loadingId === highlight.id}
                      >
                        {loadingId === highlight.id ? (
                          <>
                            <LoadingBook size={14} /> 生成中...
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
      </div>
      
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

export default React.memo(HighlightPanel);
