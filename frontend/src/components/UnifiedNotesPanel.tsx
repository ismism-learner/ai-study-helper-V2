import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Document, BookDocument } from '../types';
import { 
  Search, X, Plus, Calendar, FileText, Clock, 
  BookOpen, Tag,
  Sparkles, Zap, Send
} from 'lucide-react';
import { quickNoteApi, QuickNote, worldTimelineApi } from '../api';

interface UnifiedNote {
  id: string;
  type: 'pdf-note' | 'timeline-event' | 'quick-note';
  title: string;
  content: string;
  date?: string;
  year?: number;
  page_number?: number;
  source?: string;
  tags?: string[];
  created_at?: string;
  event_date?: string;
}

interface Position {
  x: number;
  y: number;
}

interface UnifiedNotesPanelProps {
  documentId: string;
  document?: Document | BookDocument;
  currentPage: number;
  onNoteClick?: (note: UnifiedNote) => void;
  onClose?: () => void;
}

const UnifiedNotesPanel: React.FC<UnifiedNotesPanelProps> = ({
  documentId,
  document: documentData,
  currentPage,
  onNoteClick,
  onClose,
}) => {
  const [notes, setNotes] = useState<UnifiedNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pdf-notes' | 'timeline-events'>('all');
  
  const [position, setPosition] = useState<Position>({ x: window.innerWidth - 420, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const [showEditor, setShowEditor] = useState(false);
  const [editorMode, setEditorMode] = useState<'quick' | 'standard'>('quick');
  const [editorContent, setEditorContent] = useState('');
  const [editorEventTitle, setEditorEventTitle] = useState('');
  const [editorEventDate, setEditorEventDate] = useState('');
  const [editorTags, setEditorTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagHistory, setTagHistory] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAllNotes();
    loadTagHistory();
  }, [documentId]);

  useEffect(() => {
    if (showTagDropdown && tagDropdownRef.current) {
      tagDropdownRef.current.focus();
    }
  }, [showTagDropdown]);

  const loadTagHistory = async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      setTagHistory(response.data?.tags || []);
    } catch (error) {
      console.error('Failed to load tag history:', error);
    }
  };

  const parseEventDate = (dateStr: string): { displayDate: string; sortYear: number } => {
    const rangeMatch = dateStr.match(/^(\d{4})\s*[-~]\s*(\d{4})$/);
    if (rangeMatch) {
      return {
        displayDate: `${rangeMatch[1]}~${rangeMatch[2]}`,
        sortYear: parseInt(rangeMatch[1]),
      };
    }

    const yearMatch = dateStr.match(/^(\d{4})$/);
    if (yearMatch) {
      return {
        displayDate: yearMatch[1],
        sortYear: parseInt(yearMatch[1]),
      };
    }

    return {
      displayDate: dateStr,
      sortYear: parseInt(dateStr) || new Date().getFullYear(),
    };
  };

  const handleAddNote = async () => {
    if (!editorContent.trim()) {
      alert('请输入笔记内容');
      return;
    }

    if (editorMode === 'standard' && editorEventDate && !editorEventTitle.trim()) {
      alert('填写了时间就必须填写事件标题');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editorMode === 'quick' || !editorEventDate) {
        await quickNoteApi.create({
          content: editorContent.trim(),
          source_document_id: documentId,
          source_page: currentPage,
          source_type: 'pdf',
        });
      } else {
        const { displayDate } = parseEventDate(editorEventDate);
        
        await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, {
          event_title: editorEventTitle.trim(),
          event_description: editorContent.trim(),
          event_date: displayDate,
          tags: editorTags,
        });
      }

      setEditorContent('');
      setEditorEventTitle('');
      setEditorEventDate('');
      setEditorTags([]);
      setTagInput('');
      setShowEditor(false);
      
      await loadAllNotes();
      await loadTagHistory();
    } catch (error) {
      console.error('Failed to add note:', error);
      alert('提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !editorTags.includes(trimmedTag)) {
      setEditorTags([...editorTags, trimmedTag]);
      setTagInput('');
      setShowTagDropdown(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditorTags(editorTags.filter(tag => tag !== tagToRemove));
  };

  const filteredTagHistory = useMemo(() => {
    return tagHistory.filter(tag => 
      !editorTags.includes(tag) && 
      (tagInput ? tag.toLowerCase().includes(tagInput.toLowerCase()) : true)
    );
  }, [tagHistory, editorTags, tagInput]);

  const loadAllNotes = async () => {
    setIsLoading(true);
    try {
      const allNotes: UnifiedNote[] = [];
      
      try {
        const quickResponse = await quickNoteApi.list({
          source_document_id: documentId,
        });
        
        const quickNotes: UnifiedNote[] = quickResponse.data.map((note: QuickNote) => ({
          id: note.id,
          type: 'quick-note' as const,
          title: note.content?.substring(0, 50) || '快速笔记',
          content: note.content || '',
          page_number: note.source_page ?? undefined,
          created_at: note.created_at,
          tags: [],
        }));
        
        allNotes.push(...quickNotes);
      } catch (error) {
        console.error('Failed to load quick notes:', error);
      }

      try {
        const timelineResponse = await worldTimelineApi.getDocumentDirectTimelineEvents(
          documentId, 
          'event_date', 
          'asc'
        );
        
        const timelineNotes: UnifiedNote[] = timelineResponse.data.map((event: any) => ({
          id: event.id,
          type: 'timeline-event' as const,
          title: event.event_title || '事件',
          content: event.event_description || '',
          date: event.event_date,
          year: parseInt(event.event_date) || undefined,
          source: event.source_document_title || documentData?.title,
          tags: event.tags || [],
          event_date: event.event_date,
        }));
        
        allNotes.push(...timelineNotes);
      } catch (error) {
        console.error('Failed to load timeline events:', error);
      }

      setNotes(allNotes.sort((a, b) => {
        const dateA = a.created_at || a.date || '';
        const dateB = b.created_at || b.date || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }));
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAndGroupedNotes = useMemo(() => {
    let filtered = [...notes];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(note =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query)
      );
    }

    if (activeTab !== 'all') {
      if (activeTab === 'pdf-notes') {
        filtered = filtered.filter(note => note.type === 'quick-note');
      } else if (activeTab === 'timeline-events') {
        filtered = filtered.filter(note => note.type === 'timeline-event');
      }
    }

    const groups: Record<number, UnifiedNote[]> = {};
    let ungrouped: UnifiedNote[] = [];

    filtered.forEach(note => {
      if (note.year && !isNaN(note.year)) {
        if (!groups[note.year]) {
          groups[note.year] = [];
        }
        groups[note.year].push(note);
      } else {
        ungrouped.push(note);
      }
    });

    return { grouped: Object.entries(groups), ungrouped };
  }, [notes, searchQuery, activeTab]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      const maxX = window.innerWidth - 400;
      const maxY = window.innerHeight - 100;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const renderNoteCard = (note: UnifiedNote) => {
    const isTimelineEvent = note.type === 'timeline-event';
    const isPDFNote = note.type === 'quick-note';

    return (
      <div key={note.id} className="unified-note-card" onClick={() => onNoteClick?.(note)}>
        <div className="note-card-header">
          <span className={`note-date-badge ${isTimelineEvent ? 'is-timeline' : isPDFNote ? 'is-pdf-note' : ''}`}>
            {isTimelineEvent ? (
              <>
                <Calendar size={12} />
                {note.date || note.year || '未知日期'}
              </>
            ) : isPDFNote ? (
              <>
                <FileText size={12} />
                第{note.page_number || currentPage}页
              </>
            ) : (
              <>
                <Clock size={12} />
                笔记
              </>
            )}
          </span>
        </div>

        <div className="note-card-body">
          <div className="note-indicator">
            <div className={`indicator-dot ${isTimelineEvent ? 'is-timeline' : isPDFNote ? 'is-pdf-note' : ''}`} />
          </div>

          <div className="note-content-area">
            <h4 className="note-title">{note.title}</h4>
            
            {note.content && (
              <p className="note-description">{note.content}</p>
            )}

            {note.source && (
              <div className="note-source-info">
                <BookOpen size={12} />
                {note.source}
              </div>
            )}

            {note.tags && note.tags.length > 0 && (
              <div className="note-tags-row">
                {note.tags.slice(0, 3).map((tag, index) => (
                  <button key={index} className={`note-tag-btn ${index % 2 === 1 ? 'is-warning' : ''}`}>
                    <Tag size={10} style={{ marginRight: 4 }} />
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return null;
  }

  const totalNotes = notes.length;
  const pdfNotesCount = notes.filter(n => n.type === 'quick-note').length;
  const timelineEventsCount = notes.filter(n => n.type === 'timeline-event').length;

  return (
    <div 
      ref={panelRef}
      className={`unified-notes-panel ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000
      }}
    >
      <div 
        className="unified-notes-header"
        onMouseDown={handleMouseDown}
      >
        <div className="header-left">
          <div className="header-icon">
            <Sparkles size={16} />
          </div>
          <div className="header-title-group">
            <h3 className="header-title">统一笔记</h3>
            <span className="header-subtitle">{totalNotes} 条记录</span>
          </div>
        </div>
        
        <div className="header-right">
          <button 
            className="header-btn" 
            onClick={() => setShowEditor(!showEditor)}
            title="添加笔记"
          >
            <Plus size={16} />
          </button>
          {onClose && (
            <button className="header-btn" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {showEditor && (
        <div className="quick-editor">
          <div className="editor-mode-switch">
            <button 
              className={`mode-btn ${editorMode === 'quick' ? 'active' : ''}`}
              onClick={() => setEditorMode('quick')}
            >
              <Zap size={14} />
              快速
            </button>
            <button 
              className={`mode-btn ${editorMode === 'standard' ? 'active' : ''}`}
              onClick={() => setEditorMode('standard')}
            >
              <FileText size={14} />
              标准
            </button>
          </div>

          <textarea
            className="editor-textarea"
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            placeholder={editorMode === 'quick' 
              ? `快速记录第${currentPage}页的内容...` 
              : '详细记录你的想法和笔记...'}
            rows={3}
          />

          {editorMode === 'standard' && (
            <>
              <div className="editor-field">
                <label className="editor-label">
                  <Calendar size={12} />
                  事件日期（可选）
                </label>
                <input
                  type="text"
                  className="editor-input"
                  value={editorEventDate}
                  onChange={(e) => setEditorEventDate(e.target.value)}
                  placeholder="2024 或 2024-2025"
                />
              </div>

              {editorEventDate && (
                <div className="editor-field">
                  <label className="editor-label">事件标题</label>
                  <input
                    type="text"
                    className="editor-input"
                    value={editorEventTitle}
                    onChange={(e) => setEditorEventTitle(e.target.value)}
                    placeholder="简短描述这个事件..."
                  />
                </div>
              )}

              <div className="editor-field">
                <label className="editor-label">
                  <Tag size={12} />
                  标签
                </label>
                <div className="editor-tags-wrapper" ref={tagDropdownRef}>
                  <div className="editor-tags-input-row">
                    <input
                      type="text"
                      className="editor-input"
                      value={tagInput}
                      onChange={(e) => {
                        setTagInput(e.target.value);
                        setShowTagDropdown(true);
                      }}
                      onFocus={() => setShowTagDropdown(true)}
                      placeholder="输入或选择标签..."
                    />
                    <button 
                      className="editor-tag-add-btn"
                      onClick={() => handleAddTag(tagInput)}
                      disabled={!tagInput.trim()}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {showTagDropdown && (tagInput || filteredTagHistory.length > 0) && (
                    <div className="editor-tag-dropdown">
                      {tagInput.trim() && !editorTags.includes(tagInput.trim()) && (
                        <button 
                          className="tag-dropdown-item add-new"
                          onClick={() => handleAddTag(tagInput)}
                        >
                          <Plus size={12} />
                          添加 "{tagInput}"
                        </button>
                      )}
                      {filteredTagHistory.slice(0, 8).map((tag, index) => (
                        <button
                          key={index}
                          className="tag-dropdown-item"
                          onClick={() => handleAddTag(tag)}
                        >
                          <Tag size={12} />
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  {editorTags.length > 0 && (
                    <div className="editor-tags-list">
                      {editorTags.map((tag, index) => (
                        <span key={index} className="editor-tag">
                          {tag}
                          <button onClick={() => handleRemoveTag(tag)}>
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="editor-actions">
            <button 
              className="editor-submit-btn"
              onClick={handleAddNote}
              disabled={isSubmitting || !editorContent.trim()}
            >
              <Send size={14} />
              {isSubmitting ? '提交中...' : '提交'}
            </button>
          </div>
        </div>
      )}

      <div className="notes-search-bar">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input
            type="text"
            className="search-input"
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="notes-filter-tabs">
        <button 
          className={`filter-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          全部
          <span className="count-badge">{totalNotes}</span>
        </button>
        <button 
          className={`filter-tab ${activeTab === 'pdf-notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('pdf-notes')}
        >
          PDF笔记
          <span className="count-badge">{pdfNotesCount}</span>
        </button>
        <button 
          className={`filter-tab ${activeTab === 'timeline-events' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline-events')}
        >
          时间事件
          <span className="count-badge">{timelineEventsCount}</span>
        </button>
      </div>

      <div className="notes-list-container">
        {filteredAndGroupedNotes.grouped.length > 0 ? (
          filteredAndGroupedNotes.grouped.map(([yearStr, yearNotes]) => {
            const year = parseInt(yearStr);
            return (
              <div key={year}>
                <div className="notes-section-header">
                  <div className="section-header-left">
                    <div className="section-year-badge">
                      <Calendar size={14} />
                    </div>
                    <span className="section-title">{year}</span>
                  </div>
                  <span className="section-count">{yearNotes.length} 个事件</span>
                </div>
                
                {yearNotes.map(renderNoteCard)}
              </div>
            );
          })
        ) : null}

        {filteredAndGroupedNotes.ungrouped.map(renderNoteCard)}

        {(filteredAndGroupedNotes.grouped.length === 0 && filteredAndGroupedNotes.ungrouped.length === 0) && (
          <div className="notes-empty-state">
            <div className="empty-state-icon">
              <FileText size={32} />
            </div>
            <p className="empty-state-text">暂无笔记</p>
            <p className="empty-state-hint">点击右上角 + 添加笔记</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedNotesPanel;
