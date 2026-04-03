import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { WorldTimelineEvent, BookDocument } from '../types';
import { worldTimelineApi } from '../api';
import { Calendar, Clock, BookOpen, Tag, Trash2, Edit3, Search, X, Filter, ChevronUp, ChevronDown } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

interface TimelineNotesViewProps {
  bookId: string;
  book?: BookDocument;
  onNoteClick?: (note: WorldTimelineEvent) => void;
  onNoteCreated?: () => void;
  onClose?: () => void;
}

const TimelineNotesView: React.FC<TimelineNotesViewProps> = ({
  bookId,
  onNoteClick,
  onNoteCreated,
  onClose,
}) => {
  const [notes, setNotes] = useState<WorldTimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });
  const [importanceFilter, setImportanceFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    noteId: string;
    noteTitle: string;
  }>({
    isOpen: false,
    noteId: '',
    noteTitle: '',
  });
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadNotes();
  }, [bookId, onNoteCreated]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const response = await worldTimelineApi.getBookTimelineEvents(bookId, 'event_date', 'asc');
      setNotes(response.data);
      
      // 确保所有年份都展开
      const years = new Set(response.data.map(note => {
        const date = new Date(note.event_date);
        return date.getFullYear();
      }));
      setExpandedYears(years);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(note => 
        note.event_title.toLowerCase().includes(query) ||
        (note.event_description && note.event_description.toLowerCase().includes(query)) ||
        (note.tags && note.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    // 日期过滤
    if (dateFilter.from) {
      filtered = filtered.filter(note => note.event_date >= dateFilter.from);
    }
    if (dateFilter.to) {
      filtered = filtered.filter(note => note.event_date <= dateFilter.to);
    }

    // 重要性过滤
    if (importanceFilter) {
      filtered = filtered.filter(note => note.importance === importanceFilter);
    }

    return filtered;
  }, [notes, searchQuery, dateFilter, importanceFilter]);

  const groupedNotes = useMemo(() => {
    const groups: Record<number, WorldTimelineEvent[]> = {};
    
    filteredNotes.forEach(note => {
      const date = new Date(note.event_date);
      const year = date.getFullYear();
      if (!groups[year]) {
        groups[year] = [];
      }
      groups[year].push(note);
    });

    // 按年份排序
    return Object.entries(groups)
      .sort(([yearA], [yearB]) => parseInt(yearA) - parseInt(yearB))
      .map(([year, notes]) => ({
        year: parseInt(year),
        notes: notes.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
      }));
  }, [filteredNotes]);

  const handleDeleteClick = (note: WorldTimelineEvent) => {
    setDeleteConfirm({
      isOpen: true,
      noteId: note.id,
      noteTitle: note.event_title,
    });
  };

  const handleConfirmDelete = async () => {
    try {
      await worldTimelineApi.deleteTimelineEvent(deleteConfirm.noteId);
      loadNotes();
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('删除笔记失败，请重试');
    } finally {
      setDeleteConfirm({ isOpen: false, noteId: '', noteTitle: '' });
    }
  };

  const handleNoteClick = (note: WorldTimelineEvent) => {
    if (onNoteClick) {
      onNoteClick(note);
    }
  };

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  };

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high':
        return '#ef4444';
      case 'normal':
        return '#3b82f6';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="timeline-notes-view">
      <div className="timeline-notes-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <h3>时间轴笔记</h3>
          {onClose && (
            <button
              className="close-btn"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="关闭"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="timeline-notes-controls">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="搜索笔记..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search"
                onClick={() => setSearchQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            className={`filter-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            筛选
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="timeline-notes-filters">
          <div className="filter-row">
            <div className="filter-group">
              <label>日期范围</label>
              <div className="date-range">
                <input
                  type="date"
                  value={dateFilter.from}
                  onChange={(e) => setDateFilter({ ...dateFilter, from: e.target.value })}
                />
                <span>至</span>
                <input
                  type="date"
                  value={dateFilter.to}
                  onChange={(e) => setDateFilter({ ...dateFilter, to: e.target.value })}
                />
              </div>
            </div>
            <div className="filter-group">
              <label>重要性</label>
              <select
                value={importanceFilter}
                onChange={(e) => setImportanceFilter(e.target.value)}
              >
                <option value="">全部</option>
                <option value="high">高</option>
                <option value="normal">中</option>
                <option value="low">低</option>
              </select>
            </div>
          </div>
          <div className="filter-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setDateFilter({ from: '', to: '' });
                setImportanceFilter('');
              }}
            >
              重置筛选
            </button>
          </div>
        </div>
      )}

      <div className="timeline-notes-container">
        {groupedNotes.length === 0 ? (
          <div className="timeline-notes-empty">
            <Calendar size={48} strokeWidth={1} />
            <p>暂无笔记数据</p>
          </div>
        ) : (
          groupedNotes.map(group => {
            const isExpanded = expandedYears.has(group.year);
            
            return (
              <div key={group.year} className="timeline-year-group">
                <div
                  className="timeline-year-header"
                  onClick={() => toggleYear(group.year)}
                >
                  <div className="year-marker">
                    <Calendar size={14} />
                  </div>
                  <div className="year-label">{group.year}年</div>
                  <div className="note-count">{group.notes.length} 条笔记</div>
                  <div className="expand-icon">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="timeline-notes">
                    {group.notes.map(note => {
                      const date = new Date(note.event_date);
                      const dateString = `${date.getMonth() + 1}月${date.getDate()}日`;
                      
                      return (
                        <div
                          key={note.id}
                          className="timeline-note-card"
                          onClick={() => handleNoteClick(note)}
                        >
                          <div className="note-card-header">
                            <div className="note-importance-indicator" style={{ backgroundColor: getImportanceColor(note.importance) }} />
                            <h4 className="note-title">{note.event_title}</h4>
                            <div className="note-actions">
                              <button
                                className="action-btn edit-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // 编辑功能待实现
                                }}
                                title="编辑"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                className="action-btn delete-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(note);
                                }}
                                title="删除"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          
                          <div className="note-card-content">
                            {note.event_description && (
                              <div className="note-description">
                                <ReactMarkdown 
                                  remarkPlugins={[remarkGfm, remarkMath]} 
                                  rehypePlugins={[rehypeKatex]}
                                >
                                  {note.event_description}
                                </ReactMarkdown>
                              </div>
                            )}
                            
                            <div className="note-meta">
                              <div className="meta-item">
                                <Clock size={12} />
                                <span>{note.event_date_display || dateString}</span>
                              </div>
                              <div className="meta-item">
                                <BookOpen size={12} />
                                <span>第 {note.page_number} 页</span>
                              </div>
                            </div>
                            
                            {note.tags && note.tags.length > 0 && (
                              <div className="note-tags">
                                {note.tags.map((tag, index) => (
                                  <span key={index} className="note-tag">
                                    <Tag size={10} />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="确认删除"
        message={`确定要删除笔记"${deleteConfirm.noteTitle}"吗？此操作无法撤销。`}
        confirmText="删除"
        cancelText="取消"
        type="delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, noteId: '', noteTitle: '' })}
      />
    </div>
  );
};

export default TimelineNotesView;
