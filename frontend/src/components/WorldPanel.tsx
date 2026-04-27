import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BookDocument, WorldTimelineEvent, CreateTimelineEventRequest } from '../types';
import { worldTimelineApi } from '../api';
import HierarchicalTimeline from './HierarchicalTimeline';
import { 
  Clock, 
  Plus, 
  Trash2, 
  Edit2, 
  MapPin, 
  Calendar, 
  X, 
  ChevronDown, 
  ChevronUp,
  Search,
  AlertCircle,
  CheckCircle2,
  History,
  BarChart3,
  List
} from 'lucide-react';

interface WorldPanelProps {
  book: BookDocument;
  currentPage: number;
  onJumpToPage: (pageNumber: number) => void;
  onClose: () => void;
}

interface EventFormData {
  event_date: string;
  event_date_display: string;
  page_number: number;
  event_title: string;
  event_description: string;
  tags: string;
}

interface Position {
  x: number;
  y: number;
}

const WorldPanel: React.FC<WorldPanelProps> = ({ book, currentPage, onJumpToPage, onClose }) => {
  const [events, setEvents] = useState<WorldTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<WorldTimelineEvent | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'page' | 'created'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [historyTags, setHistoryTags] = useState<string[]>([]);
  const [showFormTagDropdown, setShowFormTagDropdown] = useState(false);
  const [showSearchTagDropdown, setShowSearchTagDropdown] = useState(false);
  
  // 拖动相关状态
  const [position, setPosition] = useState<Position>({ x: window.innerWidth - 420, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<EventFormData>({
    event_date: '',
    event_date_display: '',
    page_number: currentPage,
    event_title: '',
    event_description: '',
    tags: ''
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await worldTimelineApi.getBookTimelineEvents(book.id, sortBy, sortOrder);
      setEvents(response.data);
    } catch (err) {
      setError('加载时间节点失败');
      console.error('Failed to fetch timeline events:', err);
    } finally {
      setLoading(false);
    }
  }, [book.id, sortBy, sortOrder]);

  // 加载历史标签
  const loadHistoryTags = useCallback(async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      console.log('History tags response:', response.data);
      setHistoryTags(response.data.tags || []);
    } catch (error) {
      console.error('Failed to load history tags:', error);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    loadHistoryTags();
  }, [fetchEvents, loadHistoryTags]);

  useEffect(() => {
    if (!editingEvent) {
      setFormData(prev => ({ ...prev, page_number: currentPage }));
    }
  }, [currentPage, editingEvent]);

  // 拖动处理函数
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
      
      // 限制面板不超出视窗
      const maxX = window.innerWidth - 380;
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const generateDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    
    const parts = dateStr.split('-');
    if (parts.length === 1) {
      const year = parseInt(parts[0]);
      if (year < 0) {
        return `公元前${Math.abs(year)}年`;
      }
      return `${year}年`;
    } else if (parts.length === 2) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      if (year < 0) {
        return `公元前${Math.abs(year)}年${month}月`;
      }
      return `${year}年${month}月`;
    } else if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      if (year < 0) {
        return `公元前${Math.abs(year)}年${month}月${day}日`;
      }
      return `${year}年${month}月${day}日`;
    }
    return dateStr;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value;
    setFormData(prev => ({
      ...prev,
      event_date: dateValue,
      event_date_display: generateDateDisplay(dateValue)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.event_date || !formData.event_title) {
      setError('请填写日期和事件标题');
      return;
    }

    const data: CreateTimelineEventRequest = {
      event_date: formData.event_date,
      event_date_display: formData.event_date_display || generateDateDisplay(formData.event_date),
      page_number: formData.page_number,
      event_title: formData.event_title,
      event_description: formData.event_description || undefined,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined
    };

    try {
      if (editingEvent) {
        await worldTimelineApi.updateTimelineEvent(editingEvent.id, data);
      } else {
        await worldTimelineApi.createTimelineEvent(book.id, data);
      }
      
      setFormData({
        event_date: '',
        event_date_display: '',
        page_number: currentPage,
        event_title: '',
        event_description: '',
        tags: ''
      });
      setShowAddForm(false);
      setEditingEvent(null);
      fetchEvents();
    } catch (err) {
      setError(editingEvent ? '更新失败' : '创建失败');
      console.error('Failed to save timeline event:', err);
    }
  };

  const handleEdit = (event: WorldTimelineEvent) => {
    setEditingEvent(event);
    setFormData({
      event_date: event.event_date,
      event_date_display: event.event_date_display,
      page_number: event.page_number,
      event_title: event.event_title,
      event_description: event.event_description || '',
      tags: event.tags?.join(', ') || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm('确定要删除这个时间节点吗？')) return;
    
    try {
      await worldTimelineApi.deleteTimelineEvent(eventId);
      fetchEvents();
    } catch (err) {
      setError('删除失败');
      console.error('Failed to delete timeline event:', err);
    }
  };

  const toggleEventExpand = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const filteredEvents = events.filter(event => 
    searchQuery === '' || 
    event.event_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (event.event_description && event.event_description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleTagClick = (tag: string) => {
    setSearchQuery(prev => prev ? `${prev}, ${tag}` : tag);
    setShowSearchTagDropdown(false);
  };

  return (
    <div 
      ref={panelRef}
      className={`world-panel ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000
      }}
    >
      <div 
        className="world-panel-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="header-title">
          <Clock size={20} />
          <h3>事件笔记</h3>
          <span className="event-count">{events.length} 条记录</span>
          <span style={{ 
            background: 'var(--primary-color)', 
            color: 'white', 
            padding: '2px 8px', 
            borderRadius: '4px', 
            fontSize: '12px',
            fontWeight: 'bold',
            marginLeft: '8px'
          }}>
            当前页: {currentPage}
          </span>
        </div>
        <div className="header-actions">
          <button 
            className="view-mode-btn"
            onClick={(e) => {
              e.stopPropagation();
              setViewMode(prev => prev === 'list' ? 'timeline' : 'list');
            }}
            title={viewMode === 'list' ? '切换到时间轴视图' : '切换到列表视图'}
          >
            {viewMode === 'list' ? <BarChart3 size={16} /> : <List size={16} />}
          </button>
          <button 
            className="add-event-btn"
            onClick={(e) => {
              e.stopPropagation();
              setEditingEvent(null);
              setFormData({
                event_date: '',
                event_date_display: '',
                page_number: currentPage,
                event_title: '',
                event_description: '',
                tags: ''
              });
              setShowAddForm(!showAddForm);
            }}
          >
            {showAddForm ? <X size={16} /> : <Plus size={16} />}
          </button>
          <button 
            className="close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {showAddForm && (
        <form className="event-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>时间节点</label>
              <input
                type="text"
                name="event_date"
                value={formData.event_date}
                onChange={handleDateChange}
                placeholder="如: -0221 或 2024-03-15"
                required
              />
              <small>格式: YYYY-MM-DD (公元前用负数，如 -0221)</small>
            </div>
            <div className="form-group">
              <label>显示格式</label>
              <input
                type="text"
                name="event_date_display"
                value={formData.event_date_display}
                onChange={handleInputChange}
                placeholder="如: 公元前221年"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>关联页码</label>
              <input
                type="number"
                name="page_number"
                value={formData.page_number}
                onChange={handleInputChange}
                min={1}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>事件标题</label>
            <input
              type="text"
              name="event_title"
              value={formData.event_title}
              onChange={handleInputChange}
              placeholder="输入事件标题..."
              required
            />
          </div>

          <div className="form-group">
            <label>事件描述</label>
            <textarea
              name="event_description"
              value={formData.event_description}
              onChange={handleInputChange}
              placeholder="输入事件详细描述..."
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>标签 (用逗号分隔)</label>
            <input
              type="text"
              name="tags"
              value={formData.tags}
              onChange={handleInputChange}
              placeholder="如: 战争, 政治, 经济"
            />
            {historyTags.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowFormTagDropdown(!showFormTagDropdown)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'var(--bg-muted)',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span>快速选择历史标签 ({historyTags.length}个可用)</span>
                  {showFormTagDropdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showFormTagDropdown && (
                  <div style={{
                    marginTop: '4px',
                    padding: '8px',
                    background: 'var(--bg-elevated, #1e293b)',
                    border: '1px solid var(--border-color, #334155)',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {historyTags.map((tag) => {
                        const isAdded = formData.tags.split(',').map(t => t.trim()).includes(tag);
                        
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              if (isAdded) {
                                const newTags = formData.tags.split(',').map(t => t.trim()).filter(t => t !== tag).join(', ');
                                setFormData(prev => ({ ...prev, tags: newTags }));
                              } else {
                                const newTags = formData.tags ? `${formData.tags}, ${tag}` : tag;
                                setFormData(prev => ({ ...prev, tags: newTags }));
                              }
                            }}
                            style={{
                              background: isAdded ? 'var(--accent-500)' : 'var(--bg-surface, #334155)',
                              color: isAdded ? 'white' : 'var(--text-primary, #e2e8f0)',
                              border: '1px solid var(--border-color, #475569)',
                              borderRadius: '12px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {isAdded ? '✓ ' : '+ '}{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              <CheckCircle2 size={16} />
              {editingEvent ? '保存修改' : '添加记录'}
            </button>
            <button 
              type="button" 
              className="btn-secondary"
              onClick={() => {
                setShowAddForm(false);
                setEditingEvent(null);
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      {viewMode === 'list' ? (
        <>
          <div className="events-toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="搜索事件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {historyTags.length > 0 && (
                <div className="tag-dropdown-container">
                  <button 
                    className="tag-dropdown-btn"
                    onClick={() => setShowSearchTagDropdown(!showSearchTagDropdown)}
                    title="历史标签"
                  >
                    <History size={16} />
                  </button>
                  {showSearchTagDropdown && (
                    <div className="tag-dropdown">
                      {historyTags.map(tag => (
                        <button
                          key={tag}
                          className="tag-option"
                          onClick={() => handleTagClick(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="sort-controls">
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as 'date' | 'page' | 'created')}
              >
                <option value="date">按时间</option>
                <option value="page">按页码</option>
                <option value="created">按创建时间</option>
              </select>
              <button 
                className="sort-order-btn"
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          <div className="events-list">
            {loading ? null : filteredEvents.length === 0 ? (
              <div className="empty-state">
                <History size={48} strokeWidth={1} />
                <p>{searchQuery ? '未找到匹配的事件' : '暂无时间节点记录'}</p>
                <span>点击"添加"按钮记录第一个时间节点</span>
              </div>
            ) : (
              filteredEvents.map((event, index) => (
                <div 
                  key={event.id} 
                  className={`event-item ${expandedEvents.has(event.id) ? 'expanded' : ''}`}
                >
                  <div className="event-header" onClick={() => toggleEventExpand(event.id)}>
                    <div className="event-index">{index + 1}</div>
                    <div className="event-date">
                      <Calendar size={14} />
                      {event.event_date_display}
                    </div>
                    <div className="event-title">{event.event_title}</div>
                    <div className="event-page" onClick={(e) => {
                      e.stopPropagation();
                      onJumpToPage(event.page_number);
                    }}>
                      <MapPin size={14} />
                      第{event.page_number}页
                    </div>
                    <button className="expand-btn">
                      {expandedEvents.has(event.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {expandedEvents.has(event.id) && (
                    <div className="event-details">
                      {event.event_description && (
                        <div className="detail-section">
                          <label>描述</label>
                          <p>{event.event_description}</p>
                        </div>
                      )}
                      
                      {event.tags && event.tags.length > 0 && (
                        <div className="detail-section">
                          <label>标签</label>
                          <div className="tags">
                            {event.tags.map((tag, i) => (
                              <span key={i} className="tag">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="detail-meta">
                        <span>原始日期: {event.event_date}</span>
                        <span>创建: {new Date(event.created_at).toLocaleString()}</span>
                      </div>

                      <div className="event-actions">
                        <button onClick={() => handleEdit(event)}>
                          <Edit2 size={14} />
                          编辑
                        </button>
                        <button onClick={() => handleDelete(event.id)} className="danger">
                          <Trash2 size={14} />
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="timeline-view-container">
          <HierarchicalTimeline
            events={events}
            onEventClick={(event) => {
              handleEdit(event);
            }}
            onJumpToPage={onJumpToPage}
            height={400}
          />
        </div>
      )}
    </div>
  );
};

export default WorldPanel;
