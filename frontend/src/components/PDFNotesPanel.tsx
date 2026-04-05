import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Document } from '../types';
import { Search, X, ChevronUp, ChevronDown, Plus, Edit3, Trash2, BookOpen, Tag, Clock, FileText, Sparkles, Zap, ToggleLeft, ToggleRight, Send, Check, RefreshCw, CheckSquare, Square } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { optimizeApi, worldTimelineApi, quickNoteApi, QuickNote } from '../api';

interface PDFNote {
  id: string;
  title: string;
  content: string;
  page_number: number;
  created_at: string;
  tags: string[];
  // 时间属性 - 用于时间轴整合
  event_date?: string;  // 时间节点: YYYY, YYYY-MM, YYYY-MM-DD
  event_date_display?: string;  // 显示格式: 如"公元前221年"
  event_date_end?: string;  // 时间段结束（支持时间范围）
  event_date_end_display?: string;
  is_time_range?: boolean;  // 是否为时间范围
  timeline_event_id?: string;  // 关联的 WorldTimelineEvent ID
}

interface Position {
  x: number;
  y: number;
}

interface PDFNotesPanelProps {
  documentId: string;
  document?: Document;
  bookId?: string;  // 书籍ID，用于书籍阅读器场景
  currentPage: number;
  onNoteClick?: (note: PDFNote) => void;
  onClose?: () => void;
}

const PDFNotesPanel: React.FC<PDFNotesPanelProps> = ({
  documentId,
  document,
  bookId,  // 新增：书籍ID
  currentPage,
  onNoteClick,
  onClose,
}) => {
  const [notes, setNotes] = useState<PDFNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'current' | 'nearby'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    noteId: string;
    noteTitle: string;
  }>({
    isOpen: false,
    noteId: '',
    noteTitle: '',
  });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['current', 'all']));
  const [newNote, setNewNote] = useState<{
    title: string;
    content: string;
    page_number: number;
    tags: string[];
    // 时间属性
    event_date: string;
    event_date_display: string;
    event_date_end: string;
    event_date_end_display: string;
    is_time_range: boolean;
  }>({
    title: '',
    content: '',
    page_number: currentPage,
    tags: [],
    event_date: '',
    event_date_display: '',
    event_date_end: '',
    event_date_end_display: '',
    is_time_range: false,
  });
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<PDFNote | null>(null);
  const [historyTags, setHistoryTags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  
  const [position, setPosition] = useState<Position>({ x: typeof window !== 'undefined' ? window.innerWidth - 420 : 500, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const prevPageRef = useRef<number>(currentPage);

  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickContent, setQuickContent] = useState('');
  const [isSavingQuick, setIsSavingQuick] = useState(false);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [allUnprocessedQuickNotes, setAllUnprocessedQuickNotes] = useState<QuickNote[]>([]);
  const [currentQuickNote, setCurrentQuickNote] = useState<QuickNote | null>(null);
  const [selectedQuickNotes, setSelectedQuickNotes] = useState<Set<string>>(new Set());
  const [isBatchPolishing, setIsBatchPolishing] = useState(false);
  const [polishResults, setPolishResults] = useState<any[] | null>(null);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [viewMode, setViewMode] = useState<'page' | 'timeline'>('page');  // 视图模式：页面视图 / 时间序列视图

  // 时间格式解析函数
  const parseTimeInput = (inputStr: string): { event_date: string; display: string } | null => {
    if (!inputStr.trim()) return null;
    
    const str = inputStr.trim();
    let isBC = false;
    let yearStr = str;
    
    // 检测公元前（负数或"公元前"前缀）
    if (str.startsWith('-')) {
      isBC = true;
      yearStr = str.substring(1);
    } else if (str.includes('公元前')) {
      isBC = true;
      yearStr = str.replace('公元前', '').replace('年', '');
    }
    
    const parts = yearStr.split(/[-\/]/);
    const year = parseInt(parts[0]);
    if (isNaN(year)) return null;
    
    const actualYear = isBC ? -year : year;
    const prefix = isBC ? '公元前' : '';
    
    let eventDate = actualYear.toString().padStart(4, '0');
    if (actualYear < 0) {
      eventDate = actualYear.toString(); // 负数年份
    }
    
    let display = `${prefix}${Math.abs(year)}年`;
    
    if (parts.length >= 2 && parts[1]) {
      const month = parseInt(parts[1]);
      if (!isNaN(month) && month >= 1 && month <= 12) {
        eventDate += `-${month.toString().padStart(2, '0')}`;
        display += `${month}月`;
        
        if (parts.length >= 3 && parts[2]) {
          const day = parseInt(parts[2]);
          if (!isNaN(day) && day >= 1 && day <= 31) {
            eventDate += `-${day.toString().padStart(2, '0')}`;
            display += `${day}日`;
          }
        }
      }
    }
    
    return { event_date: eventDate, display };
  };

  // 解析时间范围
  const parseTimeRange = (inputStr: string): {
    start: { event_date: string; display: string } | null;
    end: { event_date: string; display: string } | null;
    isRange: boolean;
  } => {
    const separators = ['~', '～', '-', '至', '到'];
    let parts: string[] = [];
    let foundSeparator = '';
    
    for (const sep of separators) {
      if (inputStr.includes(sep)) {
        parts = inputStr.split(sep);
        foundSeparator = sep;
        break;
      }
    }
    
    if (parts.length === 2) {
      const start = parseTimeInput(parts[0].trim());
      const end = parseTimeInput(parts[1].trim());
      return { start, end, isRange: true };
    }
    
    const single = parseTimeInput(inputStr);
    return { start: single, end: null, isRange: false };
  };

  useEffect(() => {
    loadNotes();
  }, [documentId]);

  useEffect(() => {
    loadHistoryTags();
  }, []);

  useEffect(() => {
    if (isQuickMode) {
      loadQuickNotes();
      loadAllUnprocessedQuickNotes();
    }
  }, [currentPage, isQuickMode]);

  const loadHistoryTags = async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      setHistoryTags(response.data.tags || []);
    } catch (error) {
      console.error('Failed to load history tags:', error);
    }
  };

  const loadQuickNotes = useCallback(async () => {
    try {
      const nearbyPages = [currentPage - 1, currentPage, currentPage + 1].filter(p => p > 0);
      const allNotesMap = new Map<string, QuickNote>();
      
      for (const page of nearbyPages) {
        try {
          const response = await quickNoteApi.list({
            source_document_id: documentId,
            source_page: page,
            is_processed: 0,
          });
          for (const note of response.data) {
            if (!allNotesMap.has(note.id)) {
              allNotesMap.set(note.id, note);
            }
          }
        } catch (error) {
          console.error(`Failed to load quick notes for page ${page}:`, error);
        }
      }
      
      const sortedNotes = Array.from(allNotesMap.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      setQuickNotes(sortedNotes);
      if (sortedNotes.length > 0) {
        setCurrentQuickNote(sortedNotes[0]);
      } else {
        setCurrentQuickNote(null);
      }
    } catch (error) {
      console.error('Failed to load quick notes:', error);
    }
  }, [documentId, currentPage]);

  const loadAllUnprocessedQuickNotes = useCallback(async () => {
    try {
      const response = await quickNoteApi.list({
        source_document_id: documentId,
        is_processed: 0,
      });
      setAllUnprocessedQuickNotes(response.data);
    } catch (error) {
      console.error('Failed to load all unprocessed quick notes:', error);
    }
  }, [documentId]);

  useEffect(() => {
    if (prevPageRef.current !== currentPage) {
      setNewNote(prev => ({ ...prev, page_number: currentPage }));
      if (editingNote) {
        setEditingNote(prev => prev ? { ...prev, page_number: currentPage } : null);
      }
      prevPageRef.current = currentPage;
    }
  }, [currentPage, editingNote]);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const storedNotes = localStorage.getItem(`pdf_notes_${documentId}`);
      if (storedNotes) {
        setNotes(JSON.parse(storedNotes));
      } else {
        const mockNotes: PDFNote[] = [
          {
            id: '1',
            title: '笔记示例 1',
            content: '这是一个测试笔记，展示了PDF笔记功能的基本用法。',
            page_number: 1,
            created_at: new Date().toISOString(),
            tags: ['重要', '总结'],
          },
          {
            id: '2',
            title: '笔记示例 2',
            content: '这是另一个测试笔记，可以在不同页面添加笔记。',
            page_number: 2,
            created_at: new Date().toISOString(),
            tags: ['思考'],
          },
          {
            id: '3',
            title: '笔记示例 3',
            content: '笔记会自动与当前浏览的页面同步。',
            page_number: 3,
            created_at: new Date().toISOString(),
            tags: ['提示'],
          },
        ];
        setNotes(mockNotes);
        localStorage.setItem(`pdf_notes_${documentId}`, JSON.stringify(mockNotes));
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveNotes = (updatedNotes: PDFNote[]) => {
    setNotes(updatedNotes);
    localStorage.setItem(`pdf_notes_${documentId}`, JSON.stringify(updatedNotes));
  };

  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(note => 
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (filterMode === 'current') {
      filtered = filtered.filter(note => note.page_number === currentPage);
    } else if (filterMode === 'nearby') {
      filtered = filtered.filter(note => 
        Math.abs(note.page_number - currentPage) <= 2
      );
    }

    return filtered;
  }, [notes, searchQuery, filterMode, currentPage]);

  const groupedNotes = useMemo(() => {
    const groups: Record<string, PDFNote[]> = {
      current: filteredNotes.filter(note => note.page_number === currentPage),
      nearby: filteredNotes.filter(note => 
        note.page_number !== currentPage && 
        Math.abs(note.page_number - currentPage) <= 2
      ),
      other: filteredNotes.filter(note => 
        Math.abs(note.page_number - currentPage) > 2
      ),
    };

    return groups;
  }, [filteredNotes, currentPage]);

  const handleDeleteClick = (note: PDFNote) => {
    setDeleteConfirm({
      isOpen: true,
      noteId: note.id,
      noteTitle: note.title,
    });
  };

  const handleConfirmDelete = async () => {
    try {
      const updatedNotes = notes.filter(note => note.id !== deleteConfirm.noteId);
      saveNotes(updatedNotes);
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('删除笔记失败，请重试');
    } finally {
      setDeleteConfirm({ isOpen: false, noteId: '', noteTitle: '' });
    }
  };

  const handleNoteClick = (note: PDFNote) => {
    if (onNoteClick) {
      onNoteClick(note);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleAddNote = async () => {
    if (!newNote.title.trim()) {
      alert('请输入笔记标题');
      return;
    }

    try {
      const note: PDFNote = {
        id: Date.now().toString(),
        title: newNote.title,
        content: newNote.content,
        page_number: newNote.page_number,
        created_at: new Date().toISOString(),
        tags: newNote.tags,
        // 时间属性
        event_date: newNote.event_date || undefined,
        event_date_display: newNote.event_date_display || undefined,
        event_date_end: newNote.event_date_end || undefined,
        event_date_end_display: newNote.event_date_end_display || undefined,
        is_time_range: newNote.is_time_range || undefined,
      };
      
      // 如果有时间属性，同步到时间轴事件
      if (newNote.event_date) {
        try {
          const displayText = newNote.event_date_display || newNote.event_date;
          const timelineData = {
            event_date: newNote.event_date,
            event_date_display: displayText,
            event_title: newNote.title,
            event_description: newNote.content || '',
            tags: newNote.tags.length > 0 ? newNote.tags : [],
          };
          
          // 优先使用 bookId（书籍阅读器场景）
          if (bookId) {
            const requestData = {
              ...timelineData,
              page_number: newNote.page_number,
            };
            console.log('Creating timeline event (add) with bookId:', bookId, 'data:', requestData);
            const response = await worldTimelineApi.createTimelineEvent(bookId, requestData);
            note.timeline_event_id = response.data.id;
          } else if (document?.source_book_id) {
            // 如果文档关联到书籍，使用 WorldTimelineEvent
            const response = await worldTimelineApi.createTimelineEvent(document.source_book_id, {
              ...timelineData,
              page_number: newNote.page_number,
            });
            note.timeline_event_id = response.data.id;
          } else {
            // 否则使用 DocumentTimelineEvent（直接关联到文档）
            const response = await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, timelineData);
            note.timeline_event_id = response.data.id;
          }
        } catch (error: any) {
          console.error('Failed to sync to timeline:', error);
          console.error('Error details:', error.response?.data || error.message);
        }
      }
      
      saveNotes([...notes, note]);
      setNewNote({ 
        title: '', 
        content: '', 
        page_number: currentPage, 
        tags: [],
        event_date: '',
        event_date_display: '',
        event_date_end: '',
        event_date_end_display: '',
        is_time_range: false,
      });
      setShowAddNoteForm(false);
      setShowTimeInput(false);
    } catch (error) {
      console.error('Failed to add note:', error);
      alert('添加笔记失败，请重试');
    }
  };

  const handleEditNote = (note: PDFNote) => {
    setEditingNote({ ...note });
    setShowAddNoteForm(true);
  };

  const handleUpdateNote = async () => {
    if (!editingNote || !editingNote.title.trim()) {
      alert('请输入笔记标题');
      return;
    }

    try {
      // 如果有时间属性，同步到时间轴事件
      if (editingNote.event_date) {
        try {
          const displayText = editingNote.event_date_display || editingNote.event_date;
          const timelineData = {
            event_date: editingNote.event_date,
            event_date_display: displayText,
            event_title: editingNote.title,
            event_description: editingNote.content || '',
            tags: editingNote.tags.length > 0 ? editingNote.tags : [],
          };
          
          if (editingNote.timeline_event_id) {
            // 更新现有事件
            // 优先使用 bookId（书籍阅读器场景）
            if (bookId || document?.source_book_id) {
              await worldTimelineApi.updateTimelineEvent(editingNote.timeline_event_id, {
                ...timelineData,
                page_number: editingNote.page_number,
              });
            } else {
              await worldTimelineApi.updateDocumentDirectTimelineEvent(editingNote.timeline_event_id, timelineData);
            }
          } else {
            // 创建新事件
            // 优先使用 bookId（书籍阅读器场景）
            if (bookId) {
              const requestData = {
                ...timelineData,
                page_number: editingNote.page_number,
              };
              console.log('Creating timeline event with bookId:', bookId, 'data:', requestData);
              const response = await worldTimelineApi.createTimelineEvent(bookId, requestData);
              editingNote.timeline_event_id = response.data.id;
            } else if (document?.source_book_id) {
              const response = await worldTimelineApi.createTimelineEvent(document.source_book_id, {
                ...timelineData,
                page_number: editingNote.page_number,
              });
              editingNote.timeline_event_id = response.data.id;
            } else {
              const response = await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, timelineData);
              editingNote.timeline_event_id = response.data.id;
            }
          }
        } catch (error: any) {
          console.error('Failed to sync to timeline:', error);
          console.error('Error details:', error.response?.data || error.message);
        }
      }
      
      const updatedNotes = notes.map(note => 
        note.id === editingNote.id ? editingNote : note
      );
      saveNotes(updatedNotes);
      setEditingNote(null);
      setShowAddNoteForm(false);
      setShowTimeInput(false);
    } catch (error) {
      console.error('Failed to update note:', error);
      alert('更新笔记失败，请重试');
    }
  };

  const handleGenerateNote = async () => {
    const content = editingNote ? editingNote.content : newNote.content;
    
    if (!content || !content.trim()) {
      setGenerateError('请先输入笔记内容');
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const response = await optimizeApi.generateNote(content);
      const { title, content: generatedContent } = response.data;

      if (editingNote) {
        setEditingNote({ 
          ...editingNote, 
          title: title,
          content: generatedContent 
        });
      } else {
        setNewNote({ 
          ...newNote, 
          title: title,
          content: generatedContent 
        });
      }
    } catch (error: any) {
      console.error('Failed to generate note:', error);
      setGenerateError(error.response?.data?.detail || '生成笔记失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickSave = async () => {
    if (!quickContent.trim()) return;

    setIsSavingQuick(true);
    try {
      const response = await quickNoteApi.create({
        content: quickContent.trim(),
        source_document_id: documentId,
        source_page: currentPage,
        source_type: 'pdf',
      });
      
      setQuickContent('');
      loadQuickNotes();
    } catch (error) {
      console.error('Failed to save quick note:', error);
      alert('保存失败');
    } finally {
      setIsSavingQuick(false);
    }
  };

  const handleNewQuickNote = () => {
    setCurrentQuickNote(null);
    setQuickContent('');
  };

  const handleQuickKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleQuickSave();
    }
  };

  const handleSelectQuickNote = (noteId: string) => {
    setSelectedQuickNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  };

  const handleSelectAllQuickNotes = () => {
    if (selectedQuickNotes.size === allUnprocessedQuickNotes.length) {
      setSelectedQuickNotes(new Set());
    } else {
      setSelectedQuickNotes(new Set(allUnprocessedQuickNotes.map(n => n.id)));
    }
  };

  const handleBatchPolish = async () => {
    if (selectedQuickNotes.size === 0) {
      alert('请先选择要润色的笔记');
      return;
    }

    setIsBatchPolishing(true);
    try {
      const response = await quickNoteApi.batchProcess(
        Array.from(selectedQuickNotes),
        true
      );
      setPolishResults(response.data.results);
      loadQuickNotes();
      setSelectedQuickNotes(new Set());
    } catch (error) {
      console.error('Failed to batch polish:', error);
      alert('批量润色失败');
    } finally {
      setIsBatchPolishing(false);
    }
  };

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
    }
    
    return () => {
      if (isDragging) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const getSectionTitle = (section: string): string => {
    switch (section) {
      case 'current':
        return `当前页 (第 ${currentPage} 页)`;
      case 'nearby':
        return '附近页面';
      case 'other':
        return '其他页面';
      default:
        return section;
    }
  };

  const getSectionIcon = (section: string) => {
    switch (section) {
      case 'current':
        return <BookOpen size={14} />;
      case 'nearby':
        return <FileText size={14} />;
      default:
        return <Clock size={14} />;
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <>
      <div 
        ref={panelRef}
        className={`pdf-notes-panel ${isDragging ? 'dragging' : ''}`}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 1000
        }}
      >
      <div 
        className="pdf-notes-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3>PDF 笔记</h3>
            <span className="current-page-badge">第 {currentPage} 页</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setIsQuickMode(!isQuickMode)}
              className={`mode-toggle-btn ${isQuickMode ? 'active' : ''}`}
              title={isQuickMode ? '切换到标准模式' : '切换到快速记录模式'}
            >
              {isQuickMode ? <Zap size={14} /> : <Edit3 size={14} />}
              {isQuickMode ? '快速模式' : '标准模式'}
            </button>
            {onClose && (
              <button
                className="close-btn"
                onClick={onClose}
                title="关闭"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        
        {isQuickMode ? null : (
          <div className="pdf-notes-controls">
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
            <div className="filter-buttons">
              <button
                className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
                title="显示全部笔记"
              >
                全部
              </button>
              <button
                className={`filter-btn ${filterMode === 'current' ? 'active' : ''}`}
                onClick={() => setFilterMode('current')}
                title="仅显示当前页笔记"
              >
                当前页
              </button>
              <button
                className={`filter-btn ${filterMode === 'nearby' ? 'active' : ''}`}
                onClick={() => setFilterMode('nearby')}
                title="显示附近页面笔记"
              >
                附近
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pdf-notes-container">
        {isQuickMode ? (
          <div className="quick-mode-container">
            {quickNotes.length > 0 && (
              <div className="quick-notes-list">
                <div className="batch-actions-bar">
                  <button
                    onClick={handleSelectAllQuickNotes}
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
                    <button
                      onClick={handleBatchPolish}
                      disabled={isBatchPolishing}
                      className="batch-polish-btn"
                    >
                      <Sparkles size={14} />
                      {isBatchPolishing ? '润色中...' : '批量润色'}
                    </button>
                  )}
                  <button
                    onClick={handleNewQuickNote}
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
                    onClick={() => handleSelectQuickNote(qn.id)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectQuickNote(qn.id);
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
                      <div style={{ fontSize: 13, color: '#e2e8f0' }}>
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
                          try {
                            await quickNoteApi.delete(qn.id);
                            loadQuickNotes();
                            setSelectedQuickNotes(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(qn.id);
                              return newSet;
                            });
                          } catch (error) {
                            console.error('Failed to delete quick note:', error);
                            alert('删除失败');
                          }
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
                    onClick={() => setPolishResults(null)}
                    className="polish-results-close"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#10b981' }}>
                  笔记已润色并转换为标准笔记，可在标准模式中查看
                </div>
              </div>
            )}

            <div className="quick-input-area">
              <textarea
                value={quickContent}
                onChange={(e) => setQuickContent(e.target.value)}
                onKeyDown={handleQuickKeyDown}
                placeholder="输入笔记内容，Ctrl+Enter 保存..."
                rows={4}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Ctrl+Enter 快速保存
                </span>
                <button
                  onClick={handleQuickSave}
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
        ) : (
          <>
            {filteredNotes.length === 0 ? (
              <div className="pdf-notes-empty">
                <BookOpen size={48} strokeWidth={1} />
                <p>暂无笔记数据</p>
                <p className="hint">当前页: 第 {currentPage} 页</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setNewNote(prev => ({ ...prev, page_number: currentPage }));
                    setShowAddNoteForm(true);
                  }}
                >
                  <Plus size={16} />
                  为当前页添加笔记
                </button>
              </div>
            ) : (
              <>
                {/* 视图切换按钮 */}
                {!showAddNoteForm && (
                  <div className="view-mode-toggle" style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    marginBottom: '12px',
                    padding: '4px',
                    background: 'var(--bg-light)',
                    borderRadius: '6px'
                  }}>
                    <button
                      onClick={() => setViewMode('page')}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: viewMode === 'page' ? 'var(--primary-color)' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: viewMode === 'page' ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <BookOpen size={14} />
                      页面视图
                    </button>
                    <button
                      onClick={() => setViewMode('timeline')}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: viewMode === 'timeline' ? 'var(--primary-color)' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: viewMode === 'timeline' ? 'white' : 'var(--text-secondary)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Clock size={14} />
                      时间序列
                    </button>
                  </div>
                )}
                
                {!showAddNoteForm && (
                  <button
                    className="btn btn-primary add-note-btn"
                    onClick={() => {
                      setNewNote(prev => ({ ...prev, page_number: currentPage }));
                      setEditingNote(null);
                      setShowAddNoteForm(true);
                    }}
                  >
                    <Plus size={16} />
                    添加笔记 (第 {currentPage} 页)
                  </button>
                )}

                {showAddNoteForm && (
                  <div className="add-note-form">
                    <h4>{editingNote ? '编辑笔记' : '添加笔记'}</h4>
                    <div className="form-group">
                      <label>标题</label>
                      <input
                        type="text"
                        className="input"
                        value={editingNote ? editingNote.title : newNote.title}
                        onChange={(e) => editingNote 
                          ? setEditingNote({ ...editingNote, title: e.target.value })
                          : setNewNote({ ...newNote, title: e.target.value })
                        }
                        placeholder="输入笔记标题"
                      />
                    </div>
                    <div className="form-group">
                      <label>关联页码</label>
                      <input
                        type="number"
                        className="input"
                        value={editingNote ? editingNote.page_number : newNote.page_number}
                        onChange={(e) => editingNote 
                          ? setEditingNote({ ...editingNote, page_number: parseInt(e.target.value) || currentPage })
                          : setNewNote({ ...newNote, page_number: parseInt(e.target.value) || currentPage })
                        }
                        placeholder="输入页码"
                        min="1"
                      />
                    </div>
                    <div className="form-group">
                      <label>内容</label>
                      <textarea
                        className="input textarea"
                        value={editingNote ? editingNote.content : newNote.content}
                        onChange={(e) => editingNote 
                          ? setEditingNote({ ...editingNote, content: e.target.value })
                          : setNewNote({ ...newNote, content: e.target.value })
                        }
                        placeholder="输入笔记内容（可使用语音输入）"
                        rows={3}
                      />
                      <button
                        type="button"
                        className="ai-generate-btn"
                        onClick={handleGenerateNote}
                        disabled={isGenerating || !(editingNote ? editingNote.content : newNote.content)}
                      >
                        <Sparkles size={14} />
                        {isGenerating ? 'AI 生成中...' : 'AI 一键生成'}
                      </button>
                      {generateError && (
                        <div className="generate-error">
                          {generateError}
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label>标签</label>
                      <input
                        type="text"
                        className="input"
                        value={editingNote ? editingNote.tags.join(', ') : newNote.tags.join(', ')}
                        onChange={(e) => {
                          const tags = e.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
                          editingNote 
                            ? setEditingNote({ ...editingNote, tags })
                            : setNewNote({ ...newNote, tags });
                        }}
                        placeholder="输入标签，用逗号分隔"
                      />
                    </div>
                    
                    {/* 时间属性输入块 - 低破坏性整合 */}
                    <div className="form-group time-attribute-section">
                      <div className="time-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <Clock size={14} />
                          <span>时间属性</span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
                            (可选，用于时间轴)
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowTimeInput(!showTimeInput)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            color: showTimeInput ? 'var(--primary-color)' : 'var(--text-secondary)',
                          }}
                        >
                          {showTimeInput ? '收起' : '展开'}
                        </button>
                      </div>
                      
                      {showTimeInput && (
                        <div className="time-input-block" style={{ 
                          background: 'rgba(99, 102, 241, 0.05)', 
                          borderRadius: '8px', 
                          padding: '12px',
                          border: '1px solid rgba(99, 102, 241, 0.2)'
                        }}>
                          <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                                时间节点
                              </label>
                              <input
                                type="text"
                                className="input"
                                value={editingNote ? editingNote.event_date || '' : newNote.event_date}
                                onChange={(e) => {
                                  const parsed = parseTimeInput(e.target.value);
                                  if (editingNote) {
                                    setEditingNote({ 
                                      ...editingNote, 
                                      event_date: parsed?.event_date || e.target.value,
                                      event_date_display: parsed?.display || ''
                                    });
                                  } else {
                                    setNewNote({ 
                                      ...newNote, 
                                      event_date: parsed?.event_date || e.target.value,
                                      event_date_display: parsed?.display || ''
                                    });
                                  }
                                }}
                                placeholder="如: 1960, -0221, 1960-3-15"
                                style={{ fontSize: '13px' }}
                              />
                            </div>
                            {(editingNote ? editingNote.event_date_display : newNote.event_date_display) && (
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                padding: '6px 10px',
                                background: 'rgba(99, 102, 241, 0.1)',
                                borderRadius: '4px',
                                fontSize: '12px',
                                color: 'var(--primary-color)',
                                alignSelf: 'flex-end'
                              }}>
                                <Clock size={12} />
                                {editingNote ? editingNote.event_date_display : newNote.event_date_display}
                              </div>
                            )}
                          </div>
                          
                          <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                                时间范围（可选）
                              </label>
                              <input
                                type="text"
                                className="input"
                                value={editingNote ? editingNote.event_date_end || '' : newNote.event_date_end}
                                onChange={(e) => {
                                  const parsed = parseTimeInput(e.target.value);
                                  if (editingNote) {
                                    setEditingNote({ 
                                      ...editingNote, 
                                      event_date_end: e.target.value,
                                      event_date_end_display: parsed?.display || '',
                                      is_time_range: !!parsed
                                    });
                                  } else {
                                    setNewNote({ 
                                      ...newNote, 
                                      event_date_end: e.target.value,
                                      event_date_end_display: parsed?.display || '',
                                      is_time_range: !!parsed
                                    });
                                  }
                                }}
                                placeholder="如: 1968 (表示 1960~1968)"
                                style={{ fontSize: '13px' }}
                              />
                            </div>
                            {(editingNote ? editingNote.event_date_end_display : newNote.event_date_end_display) && (
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                padding: '6px 10px',
                                background: 'rgba(99, 102, 241, 0.1)',
                                borderRadius: '4px',
                                fontSize: '12px',
                                color: 'var(--primary-color)',
                                alignSelf: 'flex-end'
                              }}>
                                → {editingNote ? editingNote.event_date_end_display : newNote.event_date_end_display}
                              </div>
                            )}
                          </div>
                          
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                            <div>支持格式：年份(1960) | 年月(1960-3) | 完整日期(1960-3-15) | 公元前(-0221)</div>
                            <div>时间范围：起始时间~结束时间 (如: 1960~1968)</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="form-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setNewNote({ 
                            title: '', 
                            content: '', 
                            page_number: currentPage, 
                            tags: [],
                            event_date: '',
                            event_date_display: '',
                            event_date_end: '',
                            event_date_end_display: '',
                            is_time_range: false,
                          });
                          setEditingNote(null);
                          setShowAddNoteForm(false);
                          setShowTimeInput(false);
                        }}
                      >
                        取消
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={editingNote ? handleUpdateNote : handleAddNote}
                      >
                        {editingNote ? '更新' : '保存'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 根据视图模式渲染不同的笔记列表 */}
                {viewMode === 'page' ? (
                  // 页面视图（原有逻辑）
                  <>
                    {Object.entries(groupedNotes).map(([section, sectionNotes]) => {
                  if (sectionNotes.length === 0) return null;
                  
                  const isExpanded = expandedSections.has(section);
                  const sectionTitle = getSectionTitle(section);
                  
                  return (
                    <div key={section} className={`pdf-notes-section ${section === 'current' ? 'current-section' : ''}`}>
                      <div
                        className="pdf-notes-section-header"
                        onClick={() => toggleSection(section)}
                      >
                        <div className="section-title">
                          {getSectionIcon(section)}
                          {sectionTitle}
                        </div>
                        <div className="note-count">{sectionNotes.length} 条笔记</div>
                        <div className="expand-icon">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="pdf-notes-list">
                          {sectionNotes.map(note => (
                            <div
                              key={note.id}
                              className={`pdf-note-card ${note.page_number === currentPage ? 'current-page-note' : ''}`}
                              onClick={() => handleNoteClick(note)}
                            >
                              <div className="note-card-header">
                                <h4 className="note-title">{note.title}</h4>
                                <div className="note-actions">
                                  <button
                                    className="action-btn edit-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditNote(note);
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
                                {note.content && (
                                  <p className="note-content">{note.content}</p>
                                )}
                                
                                <div className="note-meta">
                                  <div className={`meta-item ${note.page_number === currentPage ? 'current-page' : ''}`}>
                                    <BookOpen size={12} />
                                    <span>第 {note.page_number} 页</span>
                                    {note.page_number === currentPage && (
                                      <span className="current-indicator">当前</span>
                                    )}
                                  </div>
                                  <div className="meta-item">
                                    <Clock size={12} />
                                    <span>{new Date(note.created_at).toLocaleString()}</span>
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
                                
                                {/* 显示时间属性 */}
                                {note.event_date && (
                                  <div className="note-time-attribute" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    marginTop: '8px',
                                    padding: '4px 8px',
                                    background: 'rgba(99, 102, 241, 0.1)',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    color: 'var(--primary-color)'
                                  }}>
                                    <Clock size={10} />
                                    <span>{note.event_date_display || note.event_date}</span>
                                    {note.event_date_end && (
                                      <>
                                        <span>~</span>
                                        <span>{note.event_date_end_display || note.event_date_end}</span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              // 时间序列视图
              <div className="timeline-notes-view">
                {(() => {
                  // 筛选有时间属性的笔记，按时间排序
                  const timeNotes = filteredNotes
                    .filter(n => n.event_date)
                    .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
                  
                  if (timeNotes.length === 0) {
                    return (
                      <div className="timeline-empty" style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: 'var(--text-secondary)'
                      }}>
                        <Clock size={48} strokeWidth={1} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p style={{ marginBottom: '8px' }}>暂无时间序列笔记</p>
                        <p style={{ fontSize: '12px' }}>为笔记添加时间属性后，将在此显示时间序列视图</p>
                      </div>
                    );
                  }
                  
                  // 按年份分组
                  const groupedByYear: Record<string, PDFNote[]> = {};
                  timeNotes.forEach(note => {
                    const year = (note.event_date || '').substring(0, 4);
                    if (!groupedByYear[year]) groupedByYear[year] = [];
                    groupedByYear[year].push(note);
                  });
                  
                  return Object.entries(groupedByYear)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([year, yearNotes]) => {
                      const yearNum = parseInt(year);
                      const isBC = yearNum < 0;
                      const displayYear = isBC ? `公元前 ${Math.abs(yearNum)} 年` : `${year} 年`;
                      
                      return (
                        <div key={year} className="timeline-year-group" style={{
                          marginBottom: '16px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          overflow: 'hidden'
                        }}>
                          <div className="year-header" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'rgba(99, 102, 241, 0.1)',
                            borderBottom: '1px solid var(--border-color)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Calendar size={14} style={{ color: 'var(--primary-color)' }} />
                              <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{displayYear}</span>
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {yearNotes.length} 条笔记
                            </span>
                          </div>
                          <div className="year-notes" style={{ padding: '8px' }}>
                            {yearNotes.map(note => (
                              <div
                                key={note.id}
                                className="timeline-note-card"
                                onClick={() => handleNoteClick(note)}
                                style={{
                                  padding: '10px',
                                  marginBottom: '8px',
                                  background: 'var(--bg-light)',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  border: note.page_number === currentPage ? '1px solid var(--primary-color)' : '1px solid transparent'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                  <h4 style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>{note.title}</h4>
                                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    {note.event_date_display || note.event_date}
                                  </span>
                                </div>
                                {note.content && (
                                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0', lineHeight: 1.4 }}>
                                    {note.content.substring(0, 80)}{note.content.length > 80 ? '...' : ''}
                                  </p>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    <BookOpen size={10} />
                                    第 {note.page_number} 页
                                  </span>
                                  {note.tags && note.tags.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      {note.tags.slice(0, 2).map((tag, i) => (
                                        <span key={i} style={{
                                          fontSize: '10px',
                                          padding: '1px 6px',
                                          background: 'rgba(99, 102, 241, 0.1)',
                                          borderRadius: '3px',
                                          color: 'var(--primary-color)'
                                        }}>
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}
          </>
            )}
          </>
        )}
      </div>
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
    </>
  );
};

export default PDFNotesPanel;
