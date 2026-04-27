import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BookDocument, Document } from '../types';
import { bookApi, documentApi, worldTimelineApi } from '../api';
import { Clock, Tag, BookOpen, Calendar, X, FileText, ChevronDown, ChevronUp, Search, Download } from 'lucide-react';
import html2pdf from 'html2pdf.js';

interface TimelineEvent {
  id: string;
  year: number;
  month?: number;
  day?: number;
  title: string;
  description: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: 'book' | 'document';
  tags: string[];
  page?: number;
}

interface TimelinePanelProps {
  onBookSelect: (book: BookDocument, page?: number) => void;
  onDocumentSelect?: (document: Document, page?: number) => void;
  refresh?: boolean;
}

interface TagColors {
  bg: string;
  text: string;
  border: string;
  light: string;
}

const PRESET_COLORS: { name: string; bg: string; text: string; border: string; light: string }[] = [
  { name: '红色', bg: 'var(--danger-500)', text: '#ffffff', border: '#dc2626', light: '#fef2f2' },
  { name: '橙色', bg: '#f97316', text: '#ffffff', border: '#ea580c', light: '#fff7ed' },
  { name: '黄色', bg: '#eab308', text: '#ffffff', border: '#ca8a04', light: '#fefce8' },
  { name: '绿色', bg: 'var(--success-500)', text: '#ffffff', border: '#16a34a', light: '#f0fdf4' },
  { name: '青色', bg: '#06b6d4', text: '#ffffff', border: '#0891b2', light: '#ecfeff' },
  { name: '蓝色', bg: '#3b82f6', text: '#ffffff', border: '#2563eb', light: '#eff6ff' },
  { name: '紫色', bg: '#8b5cf6', text: '#ffffff', border: '#7c3aed', light: '#f5f3ff' },
  { name: '粉色', bg: '#ec4899', text: '#ffffff', border: '#db2777', light: '#fdf2f8' },
  { name: '靛蓝', bg: '#6366f1', text: '#ffffff', border: '#4f46e5', light: '#eef2ff' },
  { name: '深绿', bg: '#14b8a6', text: '#ffffff', border: '#0d9488', light: '#f0fdfa' },
  { name: '棕色', bg: '#a78bfa', text: '#ffffff', border: '#8b5cf6', light: '#faf5ff' },
  { name: '灰蓝', bg: '#64748b', text: '#ffffff', border: '#475569', light: '#f8fafc' },
];

const DEFAULT_COLORS: TagColors = {
  bg: '#6b7280',
  text: '#ffffff',
  border: '#4b5563',
  light: '#f9fafb'
};

const generateColorFromString = (str: string): TagColors => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return {
    bg: `hsl(${hue}, 55%, 32%)`,
    text: `hsl(${hue}, 30%, 18%)`,
    border: `hsl(${hue}, 45%, 48%)`,
    light: `hsl(${hue}, 30%, 92%)`
  };
};

const STORAGE_KEY = 'timeline_tag_colors';

const loadTagColors = (): { [key: string]: TagColors } => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load tag colors:', e);
  }
  return {};
};

const saveTagColors = (colors: { [key: string]: TagColors }) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch (e) {
    console.error('Failed to save tag colors:', e);
  }
};

const TimelinePanel: React.FC<TimelinePanelProps> = ({ onBookSelect, onDocumentSelect, refresh = false }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [books, setBooks] = useState<BookDocument[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tagColors, setTagColors] = useState<{ [key: string]: TagColors }>({});
  const [colorPickerTag, setColorPickerTag] = useState<string | null>(null);
  const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 });
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
    setTagColors(loadTagColors());
  }, [refresh]);

  useEffect(() => {
    if (books.length > 0 || documents.length > 0) {
      extractEventsAndTags();
    }
  }, [books, documents]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setColorPickerTag(null);
      }
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setTagDropdownOpen(false);
      }
    };

    if (colorPickerTag || tagDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [colorPickerTag, tagDropdownOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [booksResponse, docsResponse, timelineEventsResponse] = await Promise.all([
        bookApi.list({}),
        documentApi.list({}),
        worldTimelineApi.getAllTimelineEvents()
      ]);
      setBooks(booksResponse.data);
      setDocuments(docsResponse.data);

      // 创建书籍ID到文档的映射（用于时间笔记跳转）
      const bookToDocMap: Record<string, Document> = {};
      docsResponse.data.forEach((doc: Document) => {
        if (doc.source_book_id) {
          bookToDocMap[doc.source_book_id] = doc;
        }
      });
      (window as any).__bookToDocMap = bookToDocMap;

      // 处理 world_timeline_events
      const worldEvents: TimelineEvent[] = timelineEventsResponse.data.map((event: any) => {
        const year = parseInt(event.event_date) || 0;
        // 解析 event_date_display 获取月和日
        let month: number | undefined;
        let day: number | undefined;
        if (event.event_date_display) {
          const parts = event.event_date_display.split('-');
          if (parts.length >= 2) {
            const parsedMonth = parseInt(parts[1]);
            if (!isNaN(parsedMonth)) month = parsedMonth;
          }
          if (parts.length >= 3) {
            const parsedDay = parseInt(parts[2]);
            if (!isNaN(parsedDay)) day = parsedDay;
          }
        }

        // 检查是 WorldTimelineEvent 还是 DocumentTimelineEvent
        if (event.document_id) {
          // DocumentTimelineEvent
          return {
            id: `document-event-${event.id}`,
            year,
            month,
            day,
            title: event.event_title,
            description: event.event_description || `《${event.document_title}》中的事件`,
            sourceId: event.document_id,
            sourceTitle: event.document_title || '未知文档',
            sourceType: 'document' as const,
            tags: event.tags || [],
            page: event.page_number,
          };
        } else {
          // WorldTimelineEvent
          // 检查是否有对应的文档
          const associatedDoc = bookToDocMap[event.book_id];
          return {
            id: `world-event-${event.id}`,
            year,
            month,
            day,
            title: event.event_title,
            description: event.event_description || `《${event.book_title}》中的事件`,
            sourceId: associatedDoc ? associatedDoc.id : event.book_id,
            sourceTitle: associatedDoc ? associatedDoc.title : (event.book_title || '未知书籍'),
            sourceType: associatedDoc ? 'document' as const : 'book' as const,
            tags: event.tags || event.book_tags || [],
            page: event.page_number,
          };
        }
      });

      // 将 world_events 存储起来供后续使用
      (window as any).__worldEvents = worldEvents;
      
      // 强制调用 extractEventsAndTags，确保时间笔记显示在时间轴中
      extractEventsAndTags();
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const extractEventsAndTags = () => {
    const tagSet = new Set<string>();
    const eventList: TimelineEvent[] = [];

    // 只显示真实的事件（WorldTimelineEvent 和 DocumentTimelineEvent）
    // 不再将书籍本身作为事件显示
    const worldEvents = (window as any).__worldEvents || [];
    worldEvents.forEach((event: TimelineEvent) => {
      eventList.push(event);
      if (event.tags) {
        event.tags.forEach(tag => tagSet.add(tag));
      }
    });

    // 文档本身不作为事件显示，只作为事件的来源
    // 但保留文档的标签用于筛选
    documents.forEach(doc => {
      if (doc.tags) {
        doc.tags.forEach(tag => tagSet.add(tag));
      }
    });

    eventList.sort((a, b) => a.year - b.year);
    setEvents(eventList);
    setAllTags(Array.from(tagSet).sort());
  };

  const getTagColors = (tag: string): TagColors => {
    if (tagColors[tag]) {
      return tagColors[tag];
    }
    return generateColorFromString(tag);
  };

  const handleTagContextMenu = (e: React.MouseEvent, tag: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    setColorPickerPosition({ x: e.clientX, y: e.clientY });
    setColorPickerTag(tag);
  };

  const handleColorSelect = (color: typeof PRESET_COLORS[0]) => {
    if (colorPickerTag) {
      const newColors = {
        ...tagColors,
        [colorPickerTag]: {
          bg: color.bg,
          text: color.text,
          border: color.border,
          light: color.light
        }
      };
      setTagColors(newColors);
      saveTagColors(newColors);
      setColorPickerTag(null);
    }
  };

  const handleResetColor = () => {
    if (colorPickerTag) {
      const newColors = { ...tagColors };
      delete newColors[colorPickerTag];
      setTagColors(newColors);
      saveTagColors(newColors);
      setColorPickerTag(null);
    }
  };

  const handleEventClick = (event: TimelineEvent) => {
    console.log('handleEventClick called:', event);
    if (event.sourceType === 'book') {
      const book = books.find(b => b.id === event.sourceId);
      if (book) {
        onBookSelect(book, event.page);
      } else {
        console.log('Book not found:', event.sourceId);
      }
    } else if (event.sourceType === 'document') {
      const doc = documents.find(d => d.id === event.sourceId);
      console.log('Looking for document:', event.sourceId, 'found:', doc);
      if (doc && onDocumentSelect) {
        onDocumentSelect(doc, event.page);
      } else {
        // 如果找不到文档，尝试从 bookToDocMap 查找
        const bookToDocMap = (window as any).__bookToDocMap || {};
        const associatedDoc = Object.values(bookToDocMap).find((d: any) => d.id === event.sourceId);
        if (associatedDoc && onDocumentSelect) {
          onDocumentSelect(associatedDoc as Document, event.page);
        } else {
          console.log('Document not found in documents array or bookToDocMap');
        }
      }
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  const clearAllTags = () => {
    setSelectedTags([]);
  };

  const filteredTags = useMemo(() => {
    if (!tagSearchQuery.trim()) {
      return allTags;
    }
    const query = tagSearchQuery.toLowerCase();
    return allTags.filter(tag => tag.toLowerCase().includes(query));
  }, [allTags, tagSearchQuery]);

  const getDateLabel = (event: TimelineEvent): string => {
    // 使用 event_date_display 格式或根据年月日构建
    if (event.year === 0) return '未知日期';
    const parts = [event.year];
    if (event.month && event.month >= 1 && event.month <= 12) {
      parts.push(event.month);
      if (event.day && event.day >= 1 && event.day <= 31) {
        parts.push(event.day);
      }
    }
    return parts.join('/');
  };

  const groupEventsByYear = (events: TimelineEvent[]) => {
    const groups: { [key: number]: TimelineEvent[] } = {};
    events.forEach(event => {
      if (!groups[event.year]) {
        groups[event.year] = [];
      }
      groups[event.year].push(event);
    });
    return Object.entries(groups).sort(([yearA], [yearB]) => parseInt(yearA) - parseInt(yearB));
  };

  const eventsBySelectedTag = useMemo(() => {
    if (selectedTags.length === 0) {
      return { '全部': events };
    }
    
    const grouped: { [tag: string]: TimelineEvent[] } = {};
    selectedTags.forEach(tag => {
      const tagEvents = events.filter(e => e.tags.includes(tag));
      if (tagEvents.length > 0) {
        grouped[tag] = tagEvents;
      }
    });
    return grouped;
  }, [events, selectedTags]);

  const totalEvents = useMemo(() => {
    if (selectedTags.length === 0) {
      return events.length;
    }
    const uniqueEventIds = new Set<string>();
    Object.values(eventsBySelectedTag).forEach(tagEvents => {
      tagEvents.forEach(event => uniqueEventIds.add(event.id));
    });
    return uniqueEventIds.size;
  }, [eventsBySelectedTag, selectedTags, events]);

  const handleExportPDF = async () => {
    // 准备 PDF 导出内容
    const exportEvents = selectedTags.length === 0 ? events : Array.from(new Set(
      Object.values(eventsBySelectedTag).flat()
    ));
    
    // 按年份分组
    const eventsByYear = groupEventsByYear(exportEvents);
    
    // 创建 PDF 内容容器
    const pdfContent = document.createElement('div');
    pdfContent.style.width = '210mm';
    pdfContent.style.margin = '0 auto';
    pdfContent.style.padding = '20mm';
    pdfContent.style.fontFamily = 'Arial, sans-serif';
    pdfContent.style.backgroundColor = '#ffffff';
    
    // 添加标题
    const title = document.createElement('h1');
    title.style.textAlign = 'center';
    title.style.color = '#374151';
    title.style.marginBottom = '30px';
    title.textContent = '年表 PDF 导出';
    pdfContent.appendChild(title);
    
    // 添加导出信息
    const exportInfo = document.createElement('p');
    exportInfo.style.textAlign = 'center';
    exportInfo.style.color = '#6b7280';
    exportInfo.style.fontSize = '12px';
    exportInfo.style.marginBottom = '30px';
    exportInfo.textContent = `导出时间: ${new Date().toLocaleString()} | 事件总数: ${exportEvents.length}`;
    pdfContent.appendChild(exportInfo);
    
    // 添加事件内容
    eventsByYear.forEach(([year, yearEvents]) => {
      // 年份标题
      const yearHeader = document.createElement('h2');
      yearHeader.style.color = '#111827';
      yearHeader.style.marginTop = '40px';
      yearHeader.style.marginBottom = '20px';
      yearHeader.style.borderBottom = '2px solid #e5e7eb';
      yearHeader.style.paddingBottom = '10px';
      yearHeader.textContent = `公元 ${year} 年`;
      pdfContent.appendChild(yearHeader);
      
      // 事件列表
    yearEvents.forEach((event) => {
      const eventCard = document.createElement('div');
        eventCard.style.background = 'white';
        eventCard.style.border = '1px solid #e5e7eb';
        eventCard.style.borderRadius = '8px';
        eventCard.style.padding = '16px';
        eventCard.style.marginBottom = '16px';
        eventCard.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        
        // 事件日期
        const eventDate = document.createElement('div');
        eventDate.style.display = 'flex';
        eventDate.style.alignItems = 'center';
        eventDate.style.gap = '6px';
        eventDate.style.fontSize = '12px';
        eventDate.style.color = '#6b7280';
        eventDate.style.marginBottom = '10px';
        eventDate.textContent = getDateLabel(event);
        eventCard.appendChild(eventDate);
        
        // 事件标题
        const eventTitle = document.createElement('h3');
        eventTitle.style.color = '#111827';
        eventTitle.style.fontSize = '16px';
        eventTitle.style.marginBottom = '8px';
        eventTitle.style.fontWeight = '600';
        eventTitle.textContent = event.title;
        eventCard.appendChild(eventTitle);
        
        // 事件描述
        if (event.description) {
          const eventDesc = document.createElement('p');
          eventDesc.style.color = '#4b5563';
          eventDesc.style.fontSize = '14px';
          eventDesc.style.lineHeight = '1.4';
          eventDesc.style.marginBottom = '12px';
          eventDesc.textContent = event.description;
          eventCard.appendChild(eventDesc);
        }
        
        // 事件来源
        const eventSource = document.createElement('div');
        eventSource.style.display = 'flex';
        eventSource.style.alignItems = 'center';
        eventSource.style.gap = '6px';
        eventSource.style.fontSize = '12px';
        eventSource.style.color = '#6b7280';
        eventSource.style.marginBottom = '12px';
        eventSource.textContent = `来源: ${event.sourceTitle} (${event.sourceType === 'book' ? '书籍' : '文档'})`;
        if (event.page) {
          eventSource.textContent += ` | 页码: P.${event.page}`;
        }
        eventCard.appendChild(eventSource);
        
        // 事件标签
        if (event.tags.length > 0) {
          const tagsContainer = document.createElement('div');
          tagsContainer.style.display = 'flex';
          tagsContainer.style.flexWrap = 'wrap';
          tagsContainer.style.gap = '6px';
          tagsContainer.style.marginTop = '10px';
          
          event.tags.forEach(tag => {
            const tagSpan = document.createElement('span');
            const colors = getTagColors(tag);
            tagSpan.style.background = colors.bg;
            tagSpan.style.color = '#ffffff';
            tagSpan.style.border = `1px solid ${colors.border}`;
            tagSpan.style.borderRadius = '12px';
            tagSpan.style.padding = '3px 10px';
            tagSpan.style.fontSize = '11px';
            tagSpan.style.whiteSpace = 'nowrap';
            tagSpan.textContent = tag;
            tagsContainer.appendChild(tagSpan);
          });
          eventCard.appendChild(tagsContainer);
        }
        
        pdfContent.appendChild(eventCard);
      });
    });
    
    // 添加到页面
    document.body.appendChild(pdfContent);
    
    // 配置 PDF 选项
    const opt = {
      margin: 10,
      filename: `年表_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };
    
    // 导出 PDF
    try {
      await html2pdf().set(opt).from(pdfContent).save();
    } catch (error) {
      console.error('PDF export failed:', error);
    } finally {
      // 清理
      document.body.removeChild(pdfContent);
    }
  };

  const renderEventCard = (event: TimelineEvent, index: number, totalInYear: number, tagColors?: TagColors) => {
    const colors = tagColors || (event.tags.length > 0 ? getTagColors(event.tags[0]) : DEFAULT_COLORS);
    
    return (
      <div key={event.id} className="timeline-event-item" style={{
        '--event-color': colors.bg,
        '--event-light': colors.light,
        '--event-border': colors.border
      } as React.CSSProperties}>
        <div className="event-connector">
          <div className="connector-dot" style={{ background: colors.bg, boxShadow: `0 0 0 2px ${colors.bg}` }}></div>
          {index < totalInYear - 1 && <div className="connector-line" style={{ background: colors.border }}></div>}
        </div>
        <div 
          className="event-content-card"
          onClick={() => handleEventClick(event)}
          style={{ borderLeft: `3px solid ${colors.bg}` }}
        >
          <div className="event-date-badge" style={{ background: colors.bg, color: '#ffffff' }}>
            <Calendar size={12} />
            <span>{getDateLabel(event)}</span>
          </div>
          <h4 className="event-name">{event.title}</h4>
          {event.description && (
            <p className="event-desc">{event.description}</p>
          )}
          <div className="event-info">
            <span className="info-source">
              {event.sourceType === 'book' ? <BookOpen size={11} /> : <FileText size={11} />}
              {event.sourceTitle}
            </span>
            {event.page && (
              <span className="info-page">P.{event.page}</span>
            )}
          </div>
          {event.tags.length > 0 && (
            <div className="event-tag-list">
              {event.tags.slice(0, 3).map((tag, i) => {
                const tagColor = getTagColors(tag);
                return (
                  <span 
                    key={i} 
                    className="tag-item"
                    style={{ 
                      background: tagColor.bg, 
                      color: '#ffffff',
                      border: `1px solid ${tagColor.border}`
                    }}
                  >
                    {tag}
                  </span>
                );
              })}
              {event.tags.length > 3 && (
                <span className="tag-item more">+{event.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTagSection = (tag: string, tagEvents: TimelineEvent[]) => {
    const colors = getTagColors(tag);
    const groupedByYear = groupEventsByYear(tagEvents);
    
    return (
      <div key={tag} className="tag-section" style={{ 
        '--section-color': colors.bg,
        '--section-light': colors.light,
        '--section-border': colors.border
      } as React.CSSProperties}>
        <div className="tag-section-header" style={{ background: colors.bg }}>
          <Tag size={18} />
          <span className="tag-section-title">{tag}</span>
          <span className="tag-section-count">{tagEvents.length} 个事件</span>
        </div>
        <div className="tag-section-body">
          <div className="timeline-grid">
            {groupedByYear.map(([year, yearEvents]) => (
              <div key={year} className="year-card" style={{ borderTop: `3px solid ${colors.bg}` }}>
                <div className="year-card-header" style={{ background: colors.light }}>
                  <div className="year-number" style={{ color: colors.text }}>
                    <Calendar size={16} />
                    <span>{year}</span>
                  </div>
                  <span className="year-count" style={{ color: colors.text }}>{yearEvents.length} 个事件</span>
                </div>
                <div className="year-card-body">
                  {yearEvents.map((event, index) => 
                    renderEventCard(event, index, yearEvents.length, colors)
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="timeline-panel">
      <div className="timeline-filters">
        <div className="filter-section">
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleExportPDF}
                title="导出为 PDF"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  background: 'var(--success-500)',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <Download size={12} />
                导出 PDF
              </button>
              {selectedTags.length > 0 && (
                <button
                  onClick={clearAllTags}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    background: 'var(--danger-500)',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <X size={12} />
                  清除 ({selectedTags.length})
                </button>
              )}
            </div>
          </div>
          
          <div 
            className="tag-selector-container" 
            ref={tagDropdownRef}
            style={{
              position: 'relative',
              width: '100%'
            }}
          >
            <button
              className="tag-dropdown-toggle"
              onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: tagDropdownOpen ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                color: 'var(--text-primary)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={14} />
                <span>
                  {selectedTags.length === 0 
                    ? `全部标签 (${allTags.length})` 
                    : `已选择 ${selectedTags.length} 个标签`}
                </span>
              </div>
              {tagDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {tagDropdownOpen && (
              <div 
                className="tag-dropdown-panel"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 100,
                  maxHeight: '400px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div 
                  className="tag-search-box"
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-color)',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg-surface)',
                    borderRadius: '8px 8px 0 0'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'var(--bg-muted)',
                    borderRadius: '6px'
                  }}>
                    <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      placeholder="搜索标签..."
                      value={tagSearchQuery}
                      onChange={(e) => setTagSearchQuery(e.target.value)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        flex: 1,
                        fontSize: '13px',
                        color: 'var(--text-primary)'
                      }}
                    />
                    {tagSearchQuery && (
                      <button
                        onClick={() => setTagSearchQuery('')}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div 
                  className="tag-list-scroll"
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px'
                  }}
                >
                  {filteredTags.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '20px',
                      color: 'var(--text-secondary)',
                      fontSize: '13px'
                    }}>
                      没有找到匹配的标签
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: '6px'
                    }}>
                      {filteredTags.map(tag => {
                        const colors = getTagColors(tag);
                        const isSelected = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            className={`tag-filter-btn ${isSelected ? 'active' : ''}`}
                            onClick={() => toggleTag(tag)}
                            onContextMenu={(e) => handleTagContextMenu(e, tag)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 10px',
                              background: isSelected ? colors.bg : 'var(--bg-surface)',
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: isSelected ? '#ffffff' : 'var(--text-primary)',
                              transition: 'all 0.15s ease',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            <Tag size={12} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tag}</span>
                            {isSelected && (
                              <span style={{ fontSize: '10px' }}>✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedTags.length > 0 && (
                  <div 
                    className="selected-tags-bar"
                    style={{
                      padding: '10px 12px',
                      borderTop: '1px solid var(--border-color)',
                      background: 'var(--bg-light)',
                      borderRadius: '0 0 8px 8px'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      已选择的标签:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {selectedTags.map(tag => {
                        const colors = getTagColors(tag);
                        return (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              background: colors.bg,
                              color: '#ffffff',
                              borderRadius: '12px',
                              fontSize: '11px'
                            }}
                          >
                            {tag}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTag(tag);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {colorPickerTag && (
        <div 
          ref={colorPickerRef}
          className="color-picker-popup"
          style={{
            left: colorPickerPosition.x,
            top: colorPickerPosition.y
          }}
        >
          <div className="color-picker-header">
            <span>选择颜色: {colorPickerTag}</span>
            <button className="color-picker-close" onClick={() => setColorPickerTag(null)}>
              <X size={14} />
            </button>
          </div>
          <div className="color-picker-grid">
            {PRESET_COLORS.map(color => (
              <button
                key={color.name}
                className="color-picker-option"
                style={{ background: color.bg }}
                onClick={() => handleColorSelect(color)}
                title={color.name}
              />
            ))}
          </div>
          <button className="color-picker-reset" onClick={handleResetColor}>
            重置为默认颜色
          </button>
        </div>
      )}

      <div className="timeline-content">
        {isLoading ? null : totalEvents === 0 ? (
          <div className="empty-state">
            <Clock size={48} />
            <p>暂无年表</p>
            <small>在阅读书籍时记录事件笔记，事件将显示在这里</small>
          </div>
        ) : selectedTags.length === 0 ? (
          <div className="timeline-grid">
            {groupEventsByYear(events).map(([year, yearEvents]) => (
              <div key={year} className="year-card">
                <div className="year-card-header">
                  <div className="year-number">
                    <Calendar size={16} />
                    <span>{year}</span>
                  </div>
                  <span className="year-count">{yearEvents.length} 个事件</span>
                </div>
                <div className="year-card-body">
                  {yearEvents.map((event, index) => 
                    renderEventCard(event, index, yearEvents.length)
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="timeline-by-tags">
            {Object.entries(eventsBySelectedTag).map(([tag, tagEvents]) => 
              renderTagSection(tag, tagEvents)
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelinePanel;
