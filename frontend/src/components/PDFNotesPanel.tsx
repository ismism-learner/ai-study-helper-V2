import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Document } from '../types';
import { Search, X, ChevronUp, ChevronDown, Plus, Edit3, Trash2, BookOpen, Tag, Clock, FileText, Sparkles, Zap, Send, Check, RefreshCw, CheckSquare, Square } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { optimizeApi, quickNoteApi, QuickNote } from '../api';

interface PDFNote {
  id: string;
  title: string;
  content: string;
  page_number: number;
  created_at: string;
  tags: string[];
}

interface Position {
  x: number;
  y: number;
}

interface PDFNotesPanelProps {
  documentId: string;
  document?: Document;
  currentPage: number;
  onNoteClick?: (note: PDFNote) => void;
  onClose?: () => void;
}

const PDFNotesPanel: React.FC<PDFNotesPanelProps> = ({
  documentId,
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
  }>({
    title: '',
    content: '',
    page_number: currentPage,
    tags: [],
  });
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<PDFNote | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  
  const [position, setPosition] = useState<Position>({ x: window.innerWidth - 420, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const prevPageRef = useRef<number>(currentPage);

  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickContent, setQuickContent] = useState('');
  const [isSavingQuick, setIsSavingQuick] = useState(false);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [allUnprocessedQuickNotes, setAllUnprocessedQuickNotes] = useState<QuickNote[]>([]);
  const [_currentQuickNote, setCurrentQuickNote] = useState<QuickNote | null>(null);
  const [selectedQuickNotes, setSelectedQuickNotes] = useState<Set<string>>(new Set());
  const [isBatchPolishing, setIsBatchPolishing] = useState(false);
  const [polishResults, setPolishResults] = useState<any[] | null>(null);

  useEffect(() => {
    loadNotes();
  }, [documentId]);

  useEffect(() => {
    if (isQuickMode) {
      loadQuickNotes();
      loadAllUnprocessedQuickNotes();
    }
  }, [currentPage, isQuickMode]);

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
      };
      saveNotes([...notes, note]);
      setNewNote({ title: '', content: '', page_number: currentPage, tags: [] });
      setShowAddNoteForm(false);
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
      const updatedNotes = notes.map(note => 
        note.id === editingNote.id ? editingNote : note
      );
      saveNotes(updatedNotes);
      setEditingNote(null);
      setShowAddNoteForm(false);
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
      await quickNoteApi.create({
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                background: isQuickMode ? '#8b5cf6' : '#f3f4f6',
                color: isQuickMode ? 'white' : '#374151',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
              title={isQuickMode ? '切换到标准模式' : '切换到快速记录模式'}
            >
              {isQuickMode ? <Zap size={14} /> : <Edit3 size={14} />}
              {isQuickMode ? '快速模式' : '标准模式'}
            </button>
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
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8, 
                  marginBottom: 8,
                  padding: '8px',
                  background: '#f9fafb',
                  borderRadius: 6,
                }}>
                  <button
                    onClick={handleSelectAllQuickNotes}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      background: 'transparent',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    {selectedQuickNotes.size === allUnprocessedQuickNotes.length ? (
                      <CheckSquare size={14} />
                    ) : (
                      <Square size={14} />
                    )}
                    {selectedQuickNotes.size === allUnprocessedQuickNotes.length ? '取消全选' : '全选'}
                  </button>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    已选 {selectedQuickNotes.size} / {allUnprocessedQuickNotes.length}
                  </span>
                  {selectedQuickNotes.size > 0 && (
                    <button
                      onClick={handleBatchPolish}
                      disabled={isBatchPolishing}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 12px',
                        background: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                        marginLeft: 'auto',
                      }}
                    >
                      <Sparkles size={14} />
                      {isBatchPolishing ? '润色中...' : '批量润色'}
                    </button>
                  )}
                  <button
                    onClick={handleNewQuickNote}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      background: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <Plus size={14} />
                    新笔记
                  </button>
                </div>
                {quickNotes.map((qn) => (
                  <div 
                    key={qn.id}
                    className={`quick-note-item ${selectedQuickNotes.has(qn.id) ? 'selected' : ''}`}
                    style={{
                      padding: 8,
                      border: selectedQuickNotes.has(qn.id) ? '2px solid #8b5cf6' : '1px solid #e5e7eb',
                      borderRadius: 6,
                      marginBottom: 4,
                      cursor: 'pointer',
                      background: selectedQuickNotes.has(qn.id) ? '#f5f3ff' : 'white',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      position: 'relative',
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectQuickNote(qn.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        marginTop: 2,
                      }}
                    >
                      {selectedQuickNotes.has(qn.id) ? (
                        <CheckSquare size={16} color="#8b5cf6" />
                      ) : (
                        <Square size={16} color="#9ca3af" />
                      )}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          {new Date(qn.created_at).toLocaleTimeString()}
                        </span>
                        {qn.source_page && (
                          <span style={{
                            fontSize: 10,
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontWeight: 500,
                          }}>
                            第 {qn.source_page} 页
                          </span>
                        )}
                        {qn.is_processed === 1 && (
                          <span style={{
                            fontSize: 10,
                            background: '#dcfce7',
                            color: '#16a34a',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontWeight: 500,
                          }}>
                            已转换
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13 }}>
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
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            color: '#8b5cf6',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
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
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 4,
                        cursor: 'pointer',
                        color: '#9ca3af',
                        borderRadius: 4,
                      }}
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {polishResults && polishResults.length > 0 && (
              <div style={{
                padding: 12,
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: 8,
                marginBottom: 12,
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: 8 
                }}>
                  <span style={{ fontWeight: 500, color: '#166534' }}>
                    <Check size={14} style={{ marginRight: 4 }} />
                    润色完成 ({polishResults.length} 条)
                  </span>
                  <button
                    onClick={() => setPolishResults(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#166534' }}>
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
                style={{
                  width: '100%',
                  padding: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 14,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                  Ctrl+Enter 快速保存
                </span>
                <button
                  onClick={handleQuickSave}
                  disabled={!quickContent.trim() || isSavingQuick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    background: quickContent.trim() ? '#8b5cf6' : '#e5e7eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: quickContent.trim() ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                  }}
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
                        className="btn btn-secondary"
                        onClick={handleGenerateNote}
                        disabled={isGenerating || !(editingNote ? editingNote.content : newNote.content)}
                        style={{
                          marginTop: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          padding: '6px 12px',
                          width: '100%',
                          justifyContent: 'center',
                          background: isGenerating ? '#9ca3af' : '#8b5cf6',
                          color: 'white',
                          border: 'none'
                        }}
                      >
                        <Sparkles size={14} />
                        {isGenerating ? 'AI 生成中...' : 'AI 一键生成'}
                      </button>
                      {generateError && (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px',
                          background: '#fee',
                          border: '1px solid #fcc',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#c33'
                        }}>
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
                    <div className="form-actions">
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setNewNote({ title: '', content: '', page_number: currentPage, tags: [] });
                          setEditingNote(null);
                          setShowAddNoteForm(false);
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
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
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

export default PDFNotesPanel;
