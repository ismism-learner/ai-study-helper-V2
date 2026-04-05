import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BookDocument } from '../types';
import { bookApi, timePeriodApi } from '../api';
import TimelineView from './TimelineView';
import BookUploadModal from './BookUploadModal';
import BatchUploadModal from './BatchUploadModal';
import BookManageView from './BookManageView';
import QuickTagModal from './QuickTagModal';
import {
  Upload, BookOpen, Calendar, Tag, Layers, Settings,
  ChevronDown, ChevronUp, Clock, Edit3, ZoomOut, ZoomIn,
  RotateCcw, Cloud, X, CheckCircle, XCircle, Loader2,
  Copy, ExternalLink, Eye, EyeOff, Trash2, Plus,
  MousePointer, CheckSquare, Square, Tag as TagIcon
} from 'lucide-react';

interface TagLibraryViewProps {
  selectedTag: string | null;
  onBack: () => void;
  onBookSelect: (book: BookDocument) => void;
}

type ViewType = 'main' | 'manage';

interface TagGroup {
  tag: string;
  books: BookDocument[];
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface ContextMenuState {
  x: number;
  y: number;
}

const TagLibraryView: React.FC<TagLibraryViewProps> = ({ selectedTag, onBack, onBookSelect }) => {
  const [allBooks, setAllBooks] = useState<BookDocument[]>([]);
  const [timePeriods, setTimePeriods] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [viewMode, setViewMode] = useState<'timeline' | 'grid'>(selectedTag ? 'timeline' : 'grid');
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('main');
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [scale, setScale] = useState(1);
  const [showBooks, setShowBooks] = useState(true);

  const [showQuarkModal, setShowQuarkModal] = useState(false);
  const [quarkUploading, setQuarkUploading] = useState(false);
  const [quarkUploadResults, setQuarkUploadResults] = useState<Array<{
    book_id: string;
    book_title: string;
    success: boolean;
    message: string;
    share_url?: string;
    share_password?: string;
  }>>([]);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [taggingFromMenu, setTaggingFromMenu] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  
  const [showQuickTagModal, setShowQuickTagModal] = useState(false);
  const [quickTagInitialTag, setQuickTagInitialTag] = useState('');

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const anchorBookId = useRef<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', closeContextMenu);
      window.addEventListener('contextmenu', closeContextMenu);
      return () => {
        window.removeEventListener('click', closeContextMenu);
        window.removeEventListener('contextmenu', closeContextMenu);
      };
    }
  }, [contextMenu]);

  const loadData = async (silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [booksRes, periodsRes] = await Promise.all([
        bookApi.list(),
        timePeriodApi.list()
      ]);
      setAllBooks(booksRes.data);
      setTimePeriods(periodsRes.data);
    } catch (error) {
      console.error('Failed to load books:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const booksByTag = useMemo(() => {
    if (selectedTag) {
      return allBooks.filter(b => b.tags && b.tags.includes(selectedTag));
    }

    const groupMap: Record<string, BookDocument[]> = {};
    const untagged: BookDocument[] = [];

    allBooks.forEach(book => {
      if (book.tags && book.tags.length > 0) {
        book.tags.forEach(tag => {
          if (!groupMap[tag]) groupMap[tag] = [];
          groupMap[tag].push(book);
        });
      } else {
        untagged.push(book);
      }
    });

    const result: TagGroup[] = Object.entries(groupMap)
      .map(([tag, books]) => ({
        tag,
        books: [...new Map(books.map(b => [b.id, b])).values()]
      }))
      .sort((a, b) => b.books.length - a.books.length);

    if (untagged.length > 0) {
      result.push({ tag: '未分类', books: untagged });
    }

    return result;
  }, [allBooks, selectedTag]);

  const displayBooks = selectedTag
    ? allBooks.filter(b => b.tags && b.tags.includes(selectedTag))
    : allBooks;

  const allAvailableTags = useMemo(() => {
    const tagSet = new Set<string>();
    allBooks.forEach(book => {
      book.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [allBooks]);

  const generatedTimeline = useMemo(() => {
    if (!showBooks || !selectedTag) return [];

    const yearMap = new Map<number, BookDocument[]>();
    const unclassifiedBooks: BookDocument[] = [];

    displayBooks.forEach(book => {
      let year = book.content_era_start || book.content_era_end || book.year_start || book.year_end;

      if (!year && book.time_period_id) {
        const period = timePeriods.find(p => p.id === book.time_period_id);
        if (period) year = period.start_year || period.end_year;
      }

      if (!year) {
        unclassifiedBooks.push(book);
      } else {
        if (!yearMap.has(year)) yearMap.set(year, []);
        yearMap.get(year)!.push(book);
      }
    });

    const result: any[] = [];
    if (unclassifiedBooks.length > 0) {
      result.push({ year: -999999, books: unclassifiedBooks });
    }
    yearMap.forEach((yearBooks, year) => {
      result.push({ year, books: yearBooks });
    });

    return result.sort((a, b) => a.year - b.year);
  }, [displayBooks, timePeriods, showBooks, selectedTag]);

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    setShowBatchUploadModal(false);
    loadData();
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!window.confirm('确定要删除这本书籍吗？')) return;
    try {
      await bookApi.delete(bookId);
      setSelectedBookIds(prev => { const next = new Set(prev); next.delete(bookId); return next; });
      loadData();
    } catch (error) {
      console.error('Failed to delete book:', error);
      alert('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedBookIds.size;
    if (!window.confirm(`确定要删除选中的 ${count} 本书籍吗？此操作不可撤销。`)) return;
    try {
      for (const bookId of selectedBookIds) {
        await bookApi.delete(bookId);
      }
      setSelectedBookIds(new Set());
      setContextMenu(null);
      loadData();
    } catch (error) {
      console.error('Failed to batch delete:', error);
      alert('批量删除失败');
    }
  };

  const handleAddTag = async (bookId: string, tagName: string) => {
    if (!tagName.trim()) return;
    try {
      const book = allBooks.find(b => b.id === bookId);
      if (!book) return;
      if (book.tags && book.tags.includes(tagName.trim())) return;
      const newTags = [...(book.tags || []), tagName.trim()];
      await bookApi.update(bookId, { tags: newTags });
      loadData(true);
    } catch (error) {
      console.error('Failed to add tag:', error);
      alert('添加标签失败');
    }
  };

  const handleRemoveTag = async (bookId: string, tagToRemove: string) => {
    try {
      const book = allBooks.find(b => b.id === bookId);
      if (!book) return;
      const newTags = (book.tags || []).filter(t => t !== tagToRemove);
      await bookApi.update(bookId, { tags: newTags.length > 0 ? newTags : [] });
      loadData(true);
    } catch (error) {
      console.error('Failed to remove tag:', error);
      alert('移除标签失败');
    }
  };

  const handleBatchAddTag = async (tagName: string) => {
    if (!tagName.trim()) return;
    try {
      for (const bookId of selectedBookIds) {
        const book = allBooks.find(b => b.id === bookId);
        if (!book) continue;
        if (book.tags && book.tags.includes(tagName.trim())) continue;
        const newTags = [...(book.tags || []), tagName.trim()];
        await bookApi.update(bookId, { tags: newTags });
      }
      setTaggingFromMenu(false);
      setContextMenu(null);
      loadData(true);
    } catch (error) {
      console.error('Failed to batch add tag:', error);
      alert('批量添加标签失败');
    }
  };

  const handleUpdateTitle = async () => {
    if (!editTitleValue.trim() || selectedBookIds.size === 0) return;
    try {
      for (const bookId of selectedBookIds) {
        await bookApi.update(bookId, { title: editTitleValue.trim() });
      }
      setEditingTitle(false);
      setEditTitleValue('');
      setContextMenu(null);
      loadData();
    } catch (error) {
      console.error('Failed to update title:', error);
      alert('修改名称失败');
    }
  };

  const startEditingTitle = () => {
    if (selectedBookIds.size === 0) return;
    const firstBook = allBooks.find(b => b.id === [...selectedBookIds][0]);
    setEditTitleValue(firstBook?.title || '');
    setEditingTitle(true);
  };

  const toggleSelection = useCallback((bookId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedBookIds(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedBookIds(new Set());
    setSelectionRect(null);
    setIsDraggingSelect(false);
    anchorBookId.current = null;
  };

  const getCardRectsInView = (): Array<{ id: string; rect: DOMRect }> => {
    const results: Array<{ id: string; rect: DOMRect }> = [];
    cardRefs.current.forEach((el, id) => {
      results.push({ id, rect: el.getBoundingClientRect() });
    });
    return results;
  };

  const rectsOverlap = (r1: SelectionRect, r2: DOMRect): boolean => {
    const selLeft = Math.min(r1.startX, r1.endX);
    const selRight = Math.max(r1.startX, r1.endX);
    const selTop = Math.min(r1.startY, r1.endY);
    const selBottom = Math.max(r1.startY, r1.endY);
    return !(selRight < r2.left || selLeft > r2.right || selBottom < r2.top || selTop > r2.bottom);
  };

  const handleGridMouseDown = (e: React.MouseEvent) => {
    if (!isSelectionMode) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.taglib-book-card') || (e.target as HTMLElement).closest('.taglib-tag-chip')) return;

    e.preventDefault();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setIsDraggingSelect(true);
    setSelectionRect({
      startX: e.clientX,
      startY: e.clientY,
      endX: e.clientX,
      endY: e.clientY,
    });
  };

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSelect || !selectionRect) return;
    setSelectionRect(prev => prev ? {
      ...prev,
      endX: e.clientX,
      endY: e.clientY,
    } : null);
  };

  const handleGridMouseUp = () => {
    if (!isDraggingSelect || !selectionRect) {
      setIsDraggingSelect(false);
      return;
    }
    const rects = getCardRectsInView();
    const newlySelected = new Set<string>();
    rects.forEach(({ id, rect }) => {
      if (rectsOverlap(selectionRect, rect)) {
        newlySelected.add(id);
      }
    });
    if (newlySelected.size > 0) {
      setSelectedBookIds(newlySelected);
      const sortedIds = getSortedBookIds();
      const firstInSelection = sortedIds.find(id => newlySelected.has(id));
      if (firstInSelection) anchorBookId.current = firstInSelection;
    }
    setIsDraggingSelect(false);
    setSelectionRect(null);
  };

  const getSortedBookIds = (): string[] => {
    const entries: Array<{ id: string; top: number; left: number }> = [];
    cardRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      entries.push({ id, top: Math.round(rect.top), left: Math.round(rect.left) });
    });
    entries.sort((a, b) => {
      const rowDiff = a.top - b.top;
      if (Math.abs(rowDiff) > 10) {
        return rowDiff;
      }
      return a.left - b.left;
    });
    return entries.map(e => e.id);
  };

  const handleCardClick = (book: BookDocument, e: React.MouseEvent) => {
    if (isSelectionMode) {
      if (e.shiftKey && anchorBookId.current && anchorBookId.current !== book.id) {
        e.preventDefault();
        const sortedIds = getSortedBookIds();
        const anchorIdx = sortedIds.indexOf(anchorBookId.current);
        const clickIdx = sortedIds.indexOf(book.id);
        if (anchorIdx >= 0 && clickIdx >= 0) {
          const start = Math.min(anchorIdx, clickIdx);
          const end = Math.max(anchorIdx, clickIdx);
          const rangeIds = new Set(sortedIds.slice(start, end + 1));
          setSelectedBookIds(rangeIds);
        }
      } else {
        anchorBookId.current = book.id;
        toggleSelection(book.id, e);
      }
    } else {
      onBookSelect(book);
    }
  };

  const handleCardContextMenu = (e: React.MouseEvent, book: BookDocument) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedBookIds(new Set([book.id]));
      anchorBookId.current = book.id;
    } else if (!selectedBookIds.has(book.id)) {
      setSelectedBookIds(new Set([book.id]));
      anchorBookId.current = book.id;
    }

    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleGridContextMenu = (e: React.MouseEvent) => {
    if (!isSelectionMode) return;
    e.preventDefault();
    if (selectedBookIds.size === 0) return;
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const TagBookCard: React.FC<{ book: BookDocument }> = ({ book }) => {
    const isSelected = selectedBookIds.has(book.id);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (cardRef.current) {
        cardRefs.current.set(book.id, cardRef.current);
      }
      return () => {
        cardRefs.current.delete(book.id);
      };
    }, [book.id]);

    return (
      <div style={{ display: 'contents' }}>
        <div
          ref={cardRef}
          className={`taglib-book-card ${isSelected ? 'taglib-selected' : ''}`}
          onClick={(e) => handleCardClick(book, e)}
          onContextMenu={(e) => handleCardContextMenu(e, book)}
        >
          {isSelectionMode && (
            <div className="taglib-select-check">
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </div>
          )}
          <div className="taglib-cover-area">
            {book.cover_image ? (
              <img src={book.cover_image} alt={book.title} />
            ) : (
              <div className="taglib-cover-placeholder">
                <BookOpen size={28} />
                <span className="taglib-cover-title">{book.title}</span>
              </div>
            )}
          </div>
          <div className="taglib-author-bar">
            {book.title || '未命名'}
          </div>
          <div className="taglib-bottom-row">
            <span className="taglib-author-text">{book.author || '未知作者'}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderBookCard = (book: BookDocument) => <TagBookCard key={book.id} book={book} />;

  const filteredBooks = filterYear
    ? displayBooks.filter(b =>
        b.content_era_start === filterYear ||
        b.content_era_end === filterYear ||
        b.year_start === filterYear ||
        b.year_end === filterYear
      )
    : displayBooks;

  const allYears = Array.from(
    new Set(displayBooks.flatMap(b =>
      [b.content_era_start, b.content_era_end, b.year_start, b.year_end].filter(Boolean)
    ))
  ).sort((a, b) => (a || 0) - (b || 0));

  const getEra = (year: number | null): string => {
    if (!year) return '未知';
    if (year < -500) return '古代';
    if (year < 500) return '古典';
    if (year < 1500) return '中世纪';
    if (year < 1800) return '近代早期';
    if (year < 1900) return '近代';
    return '当代';
  };

  const booksByEra = useMemo(() => {
    const eraMap: Record<string, BookDocument[]> = {};
    filteredBooks.forEach(book => {
      const era = getEra(
        book.content_era_start || book.content_era_end || book.year_start || book.year_end
      );
      if (!eraMap[era]) eraMap[era] = [];
      eraMap[era].push(book);
    });
    return eraMap;
  }, [filteredBooks]);

  const selectedBooksTags = useMemo(() => {
    const tagCountMap: Record<string, number> = {};
    selectedBookIds.forEach(id => {
      const book = allBooks.find(b => b.id === id);
      if (book && book.tags) {
        book.tags.forEach(tag => {
          tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
        });
      }
    });
    return Object.entries(tagCountMap).map(([tag, count]) => ({ tag, count }));
  }, [selectedBookIds, allBooks]);

  const toggleTag = (tag: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  if (currentView === 'manage') {
    return (
      <BookManageView
        onBack={() => {
          setCurrentView('main');
          loadData();
        }}
        onBookSelect={onBookSelect}
      />
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Loader2 size={32} className="spin" />
      </div>
    );
  }

  const availableToAddForSelected = allAvailableTags.filter(t => {
    for (const id of selectedBookIds) {
      const book = allBooks.find(b => b.id === id);
      if (book && !(book.tags || []).includes(t)) return true;
    }
    return false;
  });

  const handleBatchRemoveTag = async (tagToRemove: string) => {
    try {
      for (const bookId of selectedBookIds) {
        const book = allBooks.find(b => b.id === bookId);
        if (!book || !book.tags) continue;
        if (!book.tags.includes(tagToRemove)) continue;
        const newTags = book.tags.filter(t => t !== tagToRemove);
        await bookApi.update(bookId, { tags: newTags.length > 0 ? newTags : [] });
      }
      loadData(true);
    } catch (error) {
      console.error('Failed to batch remove tag:', error);
      alert('批量移除标签失败');
    }
  };

  return (
    <div className="country-detail-view" onMouseUp={handleGridMouseUp} onMouseMove={handleGridMouseMove}>
      <div className="country-header" style={{
        padding: '8px 24px',
        background: 'var(--bg-white)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div className="header-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {selectedTag ? (
                <>
                  <Tag size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                  标签：{selectedTag}
                </>
              ) : '图书馆'}
            </h2>
            {isSelectionMode && (
              <span style={{
                fontSize: '12px', fontWeight: 600,
                color: '#2563eb', background: '#eff6ff',
                padding: '2px 10px', borderRadius: '10px'
              }}>
                已选 {selectedBookIds.size} 本
              </span>
            )}
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select value={filterYear || ''}
              onChange={(e) => setFilterYear(e.target.value ? parseInt(e.target.value) : null)}
              className="year-filter"
              style={{
                padding: '4px 8px', fontSize: '12px',
                border: '1px solid var(--border-color)', borderRadius: '4px',
                background: 'var(--bg-white)', color: 'var(--text-primary)'
              }}
            >
              <option value="">全部年份</option>
              {allYears.map(year => (
                <option key={year} value={year ?? ''}>{year}年</option>
              ))}
            </select>

            <button
              className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => isSelectionMode ? exitSelectionMode() : setIsSelectionMode(true)}
              title={isSelectionMode ? "退出选择模式" : "框选多本操作"}
              style={{
                padding: '4px 10px', fontSize: '12px',
                display: 'flex', alignItems: 'center', gap: '4px',
                background: isSelectionMode ? '#2563eb' : 'var(--bg-light)',
                border: isSelectionMode ? '1px solid #2563eb' : '1px solid var(--border-color)',
                borderRadius: '4px', color: isSelectionMode ? '#fff' : 'var(--text-primary)', cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <MousePointer size={13} />
              {isSelectionMode ? `${selectedBookIds.size > 0 ? `已选${selectedBookIds.size}` : '选择中'}` : '选择'}
            </button>

            {!isSelectionMode && (
              <>
                <button className="btn btn-secondary"
                  onClick={() => setShowBatchUploadModal(true)}
                  title="批量上传"
                  style={{
                    padding: '4px 8px', fontSize: '12px',
                    display: 'flex', alignItems: 'center', gap: '3px',
                    background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                    borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
                  }}
                >
                  <Layers size={12} />批量上传
                </button>
                <button className="btn btn-primary"
                  onClick={() => setShowUploadModal(true)}
                  style={{
                    padding: '4px 8px', fontSize: '12px',
                    display: 'flex', alignItems: 'center', gap: '3px',
                    background: 'var(--primary-color)', border: '1px solid var(--primary-color)',
                    borderRadius: '4px', color: 'white', cursor: 'pointer'
                  }}
                >
                  <Upload size={12} />上传书籍
                </button>
                <button className="btn btn-secondary"
                  onClick={() => setCurrentView('manage')}
                  title="图书管理"
                  style={{
                    padding: '4px 8px', fontSize: '12px',
                    display: 'flex', alignItems: 'center', gap: '3px',
                    background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                    borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
                  }}
                >
                  <Settings size={12} />管理
                </button>
                <button className="btn btn-secondary"
                  onClick={() => setShowQuarkModal(true)}
                  title="上传到夸克网盘"
                  style={{
                    padding: '4px 8px', fontSize: '12px',
                    display: 'flex', alignItems: 'center', gap: '3px',
                    background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                    borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
                  }}
                >
                  <Cloud size={12} />夸克网盘
                </button>
                <button 
                  className="btn btn-quick-tag"
                  onClick={() => {
                    setQuickTagInitialTag('');
                    setShowQuickTagModal(true);
                  }}
                  title="快速打标签"
                  style={{
                    padding: '4px 10px', fontSize: '12px',
                    display: 'flex', alignItems: 'center', gap: '4px',
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer',
                    fontWeight: 500
                  }}
                >
                  <TagIcon size={12} />快速打标
                </button>
              </>
            )}

            {isSelectionMode && selectedBookIds.size > 0 && (
              <button className="btn btn-secondary"
                onClick={exitSelectionMode}
                title="取消选择"
                style={{
                  padding: '4px 8px', fontSize: '12px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                  background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                  borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer'
                }}
              >
                <X size={12} />取消选择 ({selectedBookIds.size})
              </button>
            )}

            {viewMode === 'timeline' && selectedTag && (
              <div className="timeline-controls-inline" style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                paddingLeft: '8px', borderLeft: '1px solid var(--border-color)'
              }}>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => setEditMode(!editMode)}
                  style={{
                    padding: '4px 8px', fontSize: '12px',
                    display: 'flex', alignItems: 'center', gap: '3px',
                    background: editMode ? 'var(--primary-color)' : 'var(--bg-light)',
                    border: '1px solid var(--border-color)', borderRadius: '4px',
                    color: editMode ? 'white' : 'var(--text-primary)', cursor: 'pointer'
                  }}
                >
                  <Edit3 size={12} />{editMode ? '完成' : '编辑'}
                </button>
                <button className="zoom-btn" onClick={() => setScale(prev => Math.max(0.2, prev - 0.1))} title="缩小"
                  style={{
                    width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                    borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                  }}
                ><ZoomOut size={12} /></button>
                <span className="zoom-level" style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '35px', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
                <button className="zoom-btn" onClick={() => setScale(prev => Math.min(3, prev + 0.1))} title="放大"
                  style={{
                    width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                    borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                  }}
                ><ZoomIn size={12} /></button>
                <button className="zoom-btn" onClick={() => setScale(1)} title="重置"
                  style={{
                    width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg-light)', border: '1px solid var(--border-color)',
                    borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                  }}
                ><RotateCcw size={12} /></button>
                <button className="toggle-books-btn" onClick={() => setShowBooks(!showBooks)}
                  title={showBooks ? "隐藏书籍" : "显示书籍"}
                  style={{
                    width: 'auto', height: '24px', padding: '0 8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    background: showBooks ? 'var(--primary-color)' : 'var(--bg-light)',
                    border: '1px solid var(--border-color)', borderRadius: '4px',
                    color: showBooks ? 'white' : 'var(--text-secondary)', cursor: 'pointer',
                    fontSize: '11px', whiteSpace: 'nowrap'
                  }}
                >
                  {showBooks ? <Eye size={12} /> : <EyeOff size={12} />}
                  {showBooks ? '书籍' : '已隐藏'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={gridAreaRef}
        className={`country-content ${isSelectionMode ? 'sel-mode' : ''}`}
        onMouseDown={handleGridMouseDown}
        onContextMenu={handleGridContextMenu}
      >
        {allBooks.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={64} strokeWidth={1} />
            <h3>暂无书籍</h3>
            <p>点击"批量上传"快速添加多本书籍</p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setShowBatchUploadModal(true)}>
                <Layers size={16} />批量上传
              </button>
              <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)}>
                <Upload size={16} />单本上传
              </button>
            </div>
          </div>
        ) : selectedTag && viewMode === 'timeline' ? (
          <TimelineView
            timeline={generatedTimeline}
            onBookClick={onBookSelect}
            onDeleteBook={handleDeleteBook}
            onBooksUpdated={loadData}
            editMode={editMode}
          />
        ) : !selectedTag && viewMode === 'grid' ? (
          <div className="books-by-era">
            <div className="tag-tabs-bar">
              {(booksByTag as TagGroup[]).map(group => (
                <button
                  key={group.tag}
                  className={`tag-tab ${expandedTags.has(group.tag) ? 'active' : ''}`}
                  onClick={() => toggleTag(group.tag)}
                >
                  <Tag size={12} />
                  {group.tag}
                  <span className="tab-count">{group.books.length}</span>
                </button>
              ))}
            </div>
            <div className="tag-content-area">
              {(booksByTag as TagGroup[]).filter(g => expandedTags.has(g.tag)).map(group => (
                <div key={group.tag} className="tag-section">
                  <div className="section-header">
                    <span className="section-title">{group.tag}</span>
                    <button 
                      className="section-tag-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickTagInitialTag(group.tag === '未分类' ? '__untagged__' : group.tag);
                        setShowQuickTagModal(true);
                      }}
                      title="对此标签下的书打标签"
                    >
                      <TagIcon size={12} />
                      打标
                    </button>
                    <span className="section-count">{group.books.length}本</span>
                  </div>
                  <div className="section-books-grid">
                    {group.books.map(book => renderBookCard(book))}
                  </div>
                </div>
              ))}
              {(booksByTag as TagGroup[]).filter(g => expandedTags.has(g.tag)).length === 0 && (
                <div className="empty-hint">点击上方标签查看书籍</div>
              )}
            </div>
          </div>
        ) : selectedTag && viewMode === 'grid' ? (
          <div className="books-by-era">
            {Object.entries(booksByEra).map(([era, eraBooks]) => (
              <div key={era} className="era-category">
                <div className="era-header" onClick={() => toggleTag(era)}>
                  <div className="era-title">
                    <Clock size={16} />{era}<span className="era-count">({eraBooks.length}本)</span>
                  </div>
                  <div className="era-toggle">
                    {expandedTags.has(era) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                <div className={`era-books ${expandedTags.has(era) ? 'expanded' : ''}`}>
                  <div className="era-books-grid">
                    {eraBooks.map(book => renderBookCard(book))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {isDraggingSelect && selectionRect && createPortal(
          <div className="taglib-selection-rect" style={{
            position: 'fixed',
            left: Math.min(selectionRect.startX, selectionRect.endX),
            top: Math.min(selectionRect.startY, selectionRect.endY),
            width: Math.abs(selectionRect.endX - selectionRect.startX),
            height: Math.abs(selectionRect.endY - selectionRect.startY),
            border: '1.5px dashed #2563eb',
            background: 'rgba(37,99,235,0.08)',
            borderRadius: '6px',
            pointerEvents: 'none',
            zIndex: 2147483647,
          }} />,
          document.body
        )}
      </div>

      {contextMenu && createPortal(
        <div className="taglib-context-menu" style={{
          position: 'fixed',
          left: contextMenu.x,
          top: contextMenu.y,
          zIndex: 2147483647,
        }} onClick={(e) => e.stopPropagation()}>
          <div className="taglib-cm-header">
            <CheckSquare size={14} />
            <span>已选 {selectedBookIds.size} 本书籍</span>
          </div>
          <div className="taglib-cm-divider" />
          <button className="taglib-cm-item taglib-cm-item-primary" onClick={() => setTaggingFromMenu(true)}>
            <TagIcon size={15} />
            <span>编辑标签</span>
            <span className="taglib-cm-hint">为选中书籍添加或移除标签</span>
          </button>
          <button className="taglib-cm-item" onClick={startEditingTitle}>
            <Edit3 size={15} />
            <span>编辑名称</span>
            <span className="taglib-cm-hint">修改显示名称</span>
          </button>
          <button className="taglib-cm-item taglib-cm-item-danger" onClick={handleBatchDelete}>
            <Trash2 size={15} />
            <span>删除数据</span>
            <span className="taglib-cm-hint">永久删除 {selectedBookIds.size} 本书籍</span>
          </button>
          <div className="taglib-cm-divider" />
          <button className="taglib-cm-item" onClick={exitSelectionMode}>
            <X size={15} />
            <span>取消选择</span>
          </button>

          {taggingFromMenu && (
            <div className="taglib-cm-tag-panel" onClick={(e) => e.stopPropagation()}>
              <div className="taglib-cm-tag-label">
                <TagIcon size={14} /> 选择或输入标签：
              </div>
              <div className="taglib-cm-tag-input-row">
                <input
                  type="text"
                  placeholder="输入新标签..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const target = e.target as HTMLInputElement;
                      if (target.value.trim()) {
                        handleBatchAddTag(target.value.trim());
                        target.value = '';
                      }
                    }
                  }}
                  className="taglib-cm-tag-input"
                />
              </div>
              {selectedBooksTags.length > 0 && (
                <div className="taglib-cm-tag-section">
                  <div className="taglib-cm-tag-section-label">已有标签（点击移除）：</div>
                  <div className="taglib-cm-tag-list">
                    {selectedBooksTags.map(({ tag, count }) => (
                      <button key={tag} className="taglib-cm-tag-btn taglib-cm-tag-btn-remove"
                        onClick={() => handleBatchRemoveTag(tag)}
                        title={`移除标签「${tag}」(${count}/${selectedBookIds.size}本)`}
                      >
                        − {tag} <span className="tag-count">({count})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="taglib-cm-tag-section">
                <div className="taglib-cm-tag-section-label">可添加标签：</div>
                <div className="taglib-cm-tag-list">
                  {availableToAddForSelected.length === 0 ? (
                    <div className="taglib-cm-tag-empty">所有标签都已拥有</div>
                  ) : (
                    availableToAddForSelected.map(tag => (
                      <button key={tag} className="taglib-cm-tag-btn"
                        onClick={() => handleBatchAddTag(tag)}>
                        + {tag}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <button className="taglib-cm-tag-close" onClick={() => setTaggingFromMenu(false)}>
                <X size={14} /> 关闭
              </button>
            </div>
          )}

          {editingTitle && (
            <div className="taglib-cm-title-panel" onClick={(e) => e.stopPropagation()}>
              <div className="taglib-cm-title-label">
                <Edit3 size={14} /> 修改显示名称：
              </div>
              <input
                className="taglib-cm-title-input"
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateTitle(); }}
                placeholder="输入新的显示名称..."
                autoFocus
              />
              <div className="taglib-cm-title-actions">
                <button className="taglib-cm-title-save" onClick={handleUpdateTitle}>
                  <CheckCircle size={14} /> 保存
                </button>
                <button className="taglib-cm-title-cancel" onClick={() => setEditingTitle(false)}>
                  <X size={14} /> 取消
                </button>
              </div>
              {selectedBookIds.size > 1 && (
                <div className="taglib-cm-title-hint">将同时修改 {selectedBookIds.size} 本书籍的名称</div>
              )}
            </div>
          )}
        </div>,
        document.body
      )}

      {showUploadModal && (
        <BookUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {showBatchUploadModal && (
        <BatchUploadModal
          onClose={() => setShowBatchUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {showQuarkModal && (
        <div className="modal-overlay" onClick={() => !quarkUploading && setShowQuarkModal(false)}>
          <div className="quark-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Cloud size={18} />上传到夸克网盘</h3>
              <button className="close-btn" onClick={() => !quarkUploading && setShowQuarkModal(false)} disabled={quarkUploading}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {quarkUploadResults.length === 0 ? (
                <>
                  <div className="quark-upload-info">
                    <p>
                      将{selectedTag ? `"${selectedTag}"标签下的` : '所有'}书籍上传到夸克网盘，按标签分类存储。
                    </p>
                    <p>
                      将上传 {displayBooks.filter(b => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded').length} 本未上传的书籍
                    </p>
                  </div>
                  <div className="quark-upload-tips">
                    <h4>上传说明：</h4>
                    <ul>
                      <li>书籍将按标签分类到「我的电子图书馆/标签名」文件夹</li>
                      <li>每个标签文件夹会生成一个分享链接</li>
                      <li>相同标签的书籍共享同一个文件夹链接</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="quark-upload-results">
                  <h4>上传结果：</h4>
                  {quarkUploadResults.map((result, index) => (
                    <div key={index} className={`quark-result-item ${result.success ? 'success' : 'failed'}`}>
                      <div className="quark-result-header">
                        {result.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        <span className="quark-result-title">{result.book_title}</span>
                      </div>
                      {result.success && result.share_url && (
                        <div className="quark-result-share">
                          <a href={result.share_url} target="_blank" rel="noopener noreferrer">
                            {result.share_url}<ExternalLink size={10} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                          </a>
                          {result.share_password && <span className="quark-result-password">提取码: {result.share_password}</span>}
                          <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => navigator.clipboard.writeText(result.share_url! + (result.share_password ? ` 提取码: ${result.share_password}` : ''))}
                          ><Copy size={12} />复制</button>
                        </div>
                      )}
                      {!result.success && <div className="quark-result-error">{result.message}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowQuarkModal(false)} disabled={quarkUploading}>
                {quarkUploadResults.length > 0 ? '关闭' : '取消'}
              </button>
              {quarkUploadResults.length === 0 && (
                <button className="btn btn-primary" onClick={async () => {
                  setQuarkUploading(true);
                  setQuarkUploadResults([]);
                  try {
                    const { quarkApi } = await import('../api');
                    const booksToUpload = displayBooks.filter(b => !b.quark_upload_status || b.quark_upload_status === 'not_uploaded');
                    const booksByTag: Record<string, typeof booksToUpload> = {};
                    for (const book of booksToUpload) {
                      const primaryTag = (book.tags && book.tags.length > 0) ? book.tags[0] : '未分类';
                      if (!booksByTag[primaryTag]) booksByTag[primaryTag] = [];
                      booksByTag[primaryTag].push(book);
                    }
                    const results: typeof quarkUploadResults = [];
                    for (const [tag, tagBooks] of Object.entries(booksByTag)) {
                      try {
                        const response = await quarkApi.uploadByTag(tag, { book_ids: tagBooks.map(b => b.id) });
                        if (response.data.success) {
                          results.push({
                            book_id: `folder-${tag}`,
                            book_title: `📁 ${tag} (${response.data.uploaded_count}本)`,
                            success: true,
                            message: `已上传到 ${response.data.folder_path}`,
                            share_url: response.data.share_url || undefined,
                            share_password: response.data.share_password || undefined,
                          });
                          for (const br of response.data.results) {
                            if (!br.success) results.push({ book_id: br.book_id, book_title: `  └ ${br.book_title}`, success: false, message: br.message });
                          }
                        } else {
                          for (const book of tagBooks) results.push({ book_id: book.id, book_title: book.title, success: false, message: response.data.message });
                        }
                      } catch (error: unknown) {
                        const axiosErr = error as { response?: { data?: { detail?: string } } };
                        for (const book of tagBooks) results.push({ book_id: book.id, book_title: book.title, success: false, message: axiosErr.response?.data?.detail || '上传失败' });
                      }
                    }
                    setQuarkUploadResults(results);
                    loadData(true);
                  } finally {
                    setQuarkUploading(false);
                  }
                }} disabled={quarkUploading}>
                  {quarkUploading ? <><Loader2 size={14} className="spinning" style={{ marginRight: 4 }} />上传中...</> : <><Cloud size={14} style={{ marginRight: 4 }} />开始上传</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <QuickTagModal
        isOpen={showQuickTagModal}
        onClose={() => setShowQuickTagModal(false)}
        onTagApplied={() => loadData(true)}
        initialTag={quickTagInitialTag}
      />

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .country-content.sel-mode {
          user-select: none;
          cursor: crosshair;
        }

        .taglib-book-card {
          display: flex !important;
          flex-direction: column;
          width: 175px;
          background: #fff;
          border: 2px solid #e5e7eb;
          border-radius: 14px;
          overflow: visible !important;
          cursor: pointer;
          transition: all 0.18s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          position: relative;
        }
        .taglib-book-card:hover {
          border-color: #93c5fd;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
          transform: translateY(-2px);
        }

        .taglib-book-card.taglib-selected {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.2), 0 4px 16px rgba(37,99,235,0.25);
          transform: translateY(-1px);
        }
        .taglib-book-card.taglib-selected:hover {
          box-shadow: 0 0 0 3px rgba(37,99,235,0.3), 0 6px 20px rgba(37,99,235,0.35);
        }

        .taglib-select-check {
          position: absolute;
          top: 6px;
          left: 6px;
          z-index: 10;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(4px);
          border: 1.5px solid #2563eb;
          color: #2563eb;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          transition: all 0.15s ease;
        }
        .taglib-book-card:not(.taglib-selected) .taglib-select-check {
          border-color: #d1d5db;
          color: #9ca3af;
          background: rgba(255,255,255,0.85);
        }

        .taglib-cover-area {
          width: 100%;
          aspect-ratio: 3 / 4;
          background: #dc2626;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
          border-radius: 12px 12px 0 0;
        }
        .taglib-cover-area img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .taglib-cover-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: rgba(255,255,255,0.75);
          padding: 14px;
          text-align: center;
        }
        .taglib-cover-placeholder svg { opacity: 0.65; }
        .taglib-cover-title {
          font-size: 12px;
          font-weight: 600;
          line-height: 1.35;
          max-width: 90%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .taglib-author-bar {
          width: 100%;
          padding: 7px 10px;
          background: #6b7280;
          color: #fff;
          font-size: 11px;
          font-weight: 500;
          text-align: center;
          letter-spacing: 0.3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .taglib-bottom-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 9px 10px;
          background: #fafafa;
          border-radius: 0 0 12px 12px;
        }

        .taglib-tags-area {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: flex-start;
        }

        .taglib-tag-chip {
          font-size: 11px;
          padding: 2px 7px;
          background: #b45309;
          color: #fff;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          line-height: 1.6;
          transition: all 0.15s ease;
          max-width: 100%;
          white-space: nowrap;
        }
        .taglib-tag-chip svg { flex-shrink: 0; opacity: 0.7; transition: opacity 0.15s; }
        .taglib-tag-chip:hover {
          background: #92400e;
          box-shadow: 0 1px 4px rgba(180,83,9,0.35);
        }
        .taglib-tag-chip:hover svg { opacity: 1; }

        .taglib-more-tags {
          font-size: 10px;
          color: #9ca3af;
          font-style: italic;
          padding: 2px 4px;
        }

        .taglib-no-tag {
          font-size: 11px;
          color: #9ca3af;
          font-style: italic;
        }

        /* 右键上下文菜单 */
        .taglib-context-menu {
          min-width: 240px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
          padding: 6px;
          animation: cmFadeIn 0.12s ease-out;
        }
        @keyframes cmFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .taglib-cm-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 600;
          color: #2563eb;
        }

        .taglib-cm-divider {
          height: 1px;
          background: #f3f4f6;
          margin: 4px 0;
        }

        .taglib-cm-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          border: none;
          border-radius: 8px;
          background: transparent;
          cursor: pointer;
          font-size: 13px;
          color: #374151;
          text-align: left;
          transition: all 0.12s ease;
        }
        .taglib-cm-item:hover {
          background: #f3f4f6;
        }
        .taglib-cm-item-primary:hover {
          background: #eff6ff;
          color: #1d4ed8;
        }
        .taglib-cm-item-danger:hover {
          background: #fef2f2;
          color: #dc2626;
        }

        .taglib-cm-hint {
          margin-left: auto;
          font-size: 10px;
          color: #9ca3af;
          font-weight: 400;
        }

        /* 菜单内嵌标签面板 */
        .taglib-cm-tag-panel {
          margin-top: 6px;
          padding: 10px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .taglib-cm-tag-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 8px;
        }
        .taglib-cm-tag-input-row {
          margin-bottom: 8px;
        }
        .taglib-cm-tag-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 12px;
          background: #fff;
        }
        .taglib-cm-tag-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }
        .taglib-cm-tag-section {
          margin-bottom: 8px;
        }
        .taglib-cm-tag-section-label {
          font-size: 10px;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .taglib-cm-tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          max-height: 160px;
          overflow-y: auto;
        }
        .taglib-cm-tag-empty {
          font-size: 11px;
          color: #9ca3af;
          font-style: italic;
          padding: 8px 4px;
        }
        .taglib-cm-tag-btn {
          font-size: 11px;
          padding: 4px 10px;
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          color: #1d4ed8;
          border: 1px solid rgba(59,130,246,0.25);
          border-radius: 7px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.12s ease;
        }
        .taglib-cm-tag-btn:hover {
          background: linear-gradient(135deg, #dbeafe, #bfdbfe);
          transform: scale(1.04);
        }
        .taglib-cm-tag-btn-remove {
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          color: #dc2626;
          border-color: rgba(220, 38, 38, 0.25);
        }
        .taglib-cm-tag-btn-remove:hover {
          background: linear-gradient(135deg, #fee2e2, #fecaca);
        }
        .taglib-cm-tag-btn .tag-count {
          font-size: 9px;
          opacity: 0.7;
        }
        .taglib-cm-tag-close {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
          margin-top: 8px;
          padding: 5px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: #fff;
          color: #6b7280;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.12s ease;
        }
        .taglib-cm-tag-close:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .taglib-author-text {
          font-size: 11px;
          color: #6b7280;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
        }

        /* 菜单内嵌名称编辑面板 */
        .taglib-cm-title-panel {
          margin-top: 6px;
          padding: 10px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .taglib-cm-title-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 8px;
        }
        .taglib-cm-title-input {
          width: 100%;
          padding: 7px 10px;
          border: 1.5px solid #d1d5db;
          border-radius: 7px;
          font-size: 13px;
          color: #374151;
          outline: none;
          transition: border-color 0.15s ease;
          box-sizing: border-box;
        }
        .taglib-cm-title-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
        .taglib-cm-title-actions {
          display: flex;
          gap: 6px;
          margin-top: 8px;
        }
        .taglib-cm-title-save {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 12px;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.12s ease;
        }
        .taglib-cm-title-save:hover { background: #1d4ed8; }
        .taglib-cm-title-cancel {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 14px;
          background: #fff;
          color: #6b7280;
          border: 1px solid #d1d5db;
          border-radius: 7px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.12s ease;
        }
        .taglib-cm-title-cancel:hover {
          background: #f3f4f6;
          color: #374151;
        }
        .taglib-cm-title-hint {
          margin-top: 6px;
          font-size: 10px;
          color: #f59e0b;
          text-align: center;
        }

        /* 确保父容器不裁剪 */
        .era-books-grid,
        .books-by-era {
          overflow: visible !important;
        }
        .era-books {
          overflow: visible !important;
        }

        .quick-tag-modal {
          width: 600px;
          max-width: 90vw;
          max-height: 80vh;
          background: var(--bg-white, #fff);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .quick-tag-modal .modal-body {
          padding: 20px;
          overflow-y: auto;
        }

        .quick-tag-search .search-input-row {
          display: flex;
          gap: 12px;
        }

        .quick-tag-search .search-input-row input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 14px;
          background: var(--bg-light, #f9fafb);
        }

        .quick-tag-search .search-input-row input:focus {
          outline: none;
          border-color: #3b82f6;
          background: var(--bg-white, #fff);
        }

        .quick-tag-results {
          margin-top: 16px;
        }

        .quick-tag-results .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 13px;
          color: var(--text-secondary, #6b7280);
        }

        .quick-tag-results .results-list {
          max-height: 250px;
          overflow-y: auto;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          background: var(--bg-light, #f9fafb);
        }

        .quick-tag-results .result-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .quick-tag-results .result-item:last-child {
          border-bottom: none;
        }

        .quick-tag-results .result-title {
          flex: 1;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary, #111827);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .quick-tag-results .result-author {
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
          min-width: 80px;
        }

        .quick-tag-results .result-tags {
          display: flex;
          gap: 4px;
        }

        .quick-tag-input {
          margin-top: 16px;
        }

        .quick-tag-input input {
          width: 100%;
          padding: 12px 14px;
          border: 2px solid #3b82f6;
          border-radius: 8px;
          font-size: 14px;
          background: var(--bg-white, #fff);
        }

        .quick-tag-input input:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .tag-history {
          margin-top: 16px;
        }

        .tag-history label {
          display: block;
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
          margin-bottom: 8px;
        }

        .tag-history .history-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .history-tag-btn {
          padding: 6px 12px;
          background: var(--bg-light, #f3f4f6);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 16px;
          font-size: 12px;
          color: var(--text-primary, #111827);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .history-tag-btn:hover {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .quick-tag-modal .hint-text {
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
        }

        .btn-sm {
          padding: 4px 10px;
          font-size: 12px;
        }

        .tag-tabs-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 10px 16px;
          background: var(--bg-light, #f9fafb);
          border-bottom: 1px solid var(--border-color, #e5e7eb);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .tag-tab {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          background: var(--bg-white, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 16px;
          font-size: 12px;
          color: var(--text-secondary, #6b7280);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .tag-tab:hover {
          border-color: var(--primary-color, #3b82f6);
          color: var(--primary-color, #3b82f6);
        }

        .tag-tab.active {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border-color: transparent;
          color: white;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }

        .tab-count {
          font-size: 10px;
          opacity: 0.8;
          background: rgba(255,255,255,0.2);
          padding: 1px 5px;
          border-radius: 8px;
        }

        .tag-tab:not(.active) .tab-count {
          background: var(--bg-light, #f3f4f6);
          color: var(--text-muted, #9ca3af);
        }

        .tag-content-area {
          padding: 12px 16px;
          min-height: 200px;
        }

        .tag-section {
          margin-bottom: 20px;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
          margin-bottom: 12px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #111827);
        }

        .section-tag-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: linear-gradient(135deg, #10b981, #059669);
          border: none;
          border-radius: 12px;
          font-size: 11px;
          color: white;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .section-tag-btn:hover {
          transform: scale(1.02);
          box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
        }

        .section-count {
          margin-left: auto;
          font-size: 11px;
          color: var(--text-secondary, #6b7280);
        }

        .section-books-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
          gap: 14px;
        }

        .empty-hint {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-muted, #9ca3af);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
};

export default TagLibraryView;
