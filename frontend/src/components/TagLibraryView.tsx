import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BookDocument } from '../types';
import { bookApi, timePeriodApi } from '../api';
import BookUploadModal from './BookUploadModal';
import QuickTagModal from './QuickTagModal';
import TagKnowledgeGraphPanel from './TagKnowledgeGraphPanel';
import {
  TagBookCard,
  BookSelectionContextMenu,
  TagLibraryHeader,
  SelectionRectOverlay,
  tagLibraryStyles,
} from './tagLibrary';
import { BookOpen, Tag, Upload } from 'lucide-react';
import LoadingBook from './LoadingBook';

interface TagLibraryViewProps {
  selectedTag: string | null;
  onBookSelect: (book: BookDocument) => void;
  onTagSelect?: (tag: string) => void;
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

const TagLibraryView: React.FC<TagLibraryViewProps> = ({ selectedTag, onBookSelect, onTagSelect }) => {
  const [allBooks, setAllBooks] = useState<BookDocument[]>([]);
  const [, setTimePeriods] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [tagBarExpanded, setTagBarExpanded] = useState(false);
  const tagBarRef = useRef<HTMLDivElement>(null);
  const tagCount = allBooks.reduce((count, book) => count + (book.tags?.length || 0), 0);
  const tagBarOverflows = tagCount > 30;

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
  const [showGraphView, setShowGraphView] = useState(false); 


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

  const tagCountMap = useMemo(() => {
    const map = new Map<string, number>();
    allBooks.forEach(book => {
      book.tags?.forEach(tag => {
        map.set(tag, (map.get(tag) || 0) + 1);
      });
    });
    return map;
  }, [allBooks]);

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    loadData();
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

  const renderBookCard = (book: BookDocument) => (
    <TagBookCard
      key={book.id}
      book={book}
      isSelected={selectedBookIds.has(book.id)}
      isSelectionMode={isSelectionMode}
      cardRefs={cardRefs.current}
      onCardClick={handleCardClick}
      onCardContextMenu={handleCardContextMenu}
    />
  );

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

  const availableToAddForSelected = allAvailableTags.filter(t => {
    for (const id of selectedBookIds) {
      const book = allBooks.find(b => b.id === id);
      if (book && !(book.tags || []).includes(t)) return true;
    }
    return false;
  });

  if (showGraphView && selectedTag) {
    return (
      <TagKnowledgeGraphPanel
        tag={selectedTag}
        onBookSelect={onBookSelect}
        onBack={() => setShowGraphView(false)}
      />
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <LoadingBook size={32} />
      </div>
    );
  }

  return (
    <div className="tag-library-layout" onMouseUp={handleGridMouseUp} onMouseMove={handleGridMouseMove}>
      <TagLibraryHeader
        selectedTag={selectedTag}
        isSelectionMode={isSelectionMode}
        selectedBookIdsSize={selectedBookIds.size}
        onToggleSelectionMode={() => setIsSelectionMode(true)}
        onExitSelectionMode={exitSelectionMode}
        onShowUploadModal={() => setShowUploadModal(true)}
        onShowQuickTagModal={(tag = '') => {
          setQuickTagInitialTag(tag);
          setShowQuickTagModal(true);
        }}
      />

      <div
        ref={gridAreaRef}
        className={`tag-library-scroll ${isSelectionMode ? 'sel-mode' : ''}`}
        onMouseDown={handleGridMouseDown}
        onContextMenu={handleGridContextMenu}
      >
        {allBooks.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={64} strokeWidth={1} />
            <h3>暂无书籍</h3>
            <p>点击"上传书籍"添加你的第一本书</p>
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
                <Upload size={16} />上传书籍
              </button>
            </div>
          </div>
        ) : (
          <div className="books-by-era">
            {allAvailableTags.length > 0 && (
               <div
                 ref={tagBarRef}
                 className={`tag-tabs-bar${!tagBarExpanded && tagBarOverflows ? ' collapsed' : ''}`}
               >
                 {allAvailableTags.map(tag => (
                   <button
                     key={tag}
                     className={`tag-tab ${selectedTag === tag ? 'active' : ''}`}
                     onClick={() => {
                       if (selectedTag === tag) {
                         onTagSelect?.('');
                       } else {
                         onTagSelect?.(tag);
                       }
                     }}
                   >
                     <Tag size={12} />
                     {tag}
                     <span className="tab-count">{tagCountMap.get(tag) || 0}</span>
                   </button>
                 ))}
                 {tagBarOverflows && (
                   <button
                     className="tag-bar-expand-btn"
                     onClick={() => setTagBarExpanded(!tagBarExpanded)}
                   >
                     {tagBarExpanded ? '▲ 收起' : `▼ 全部 (${allAvailableTags.length})`}
                   </button>
                 )}
               </div>
             )}
            <div className="tag-content-area">
              {selectedTag ? (
                displayBooks.length > 0 ? (
                  <div className="section-books-grid">
                    {displayBooks.map(book => renderBookCard(book))}
                  </div>
                ) : (
                  <div className="empty-hint">该标签下没有书籍</div>
                )
              ) : (
                <>
                  {allBooks.length === 0 && (
                    <div className="empty-hint">暂无书籍，请先上传</div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <SelectionRectOverlay
          isDraggingSelect={isDraggingSelect}
          selectionRect={selectionRect}
        />
      </div>

      <BookSelectionContextMenu
        contextMenu={contextMenu}
        selectedBookIds={selectedBookIds}
        selectedBooksTags={selectedBooksTags}
        availableToAddForSelected={availableToAddForSelected}
        taggingFromMenu={taggingFromMenu}
        editingTitle={editingTitle}
        editTitleValue={editTitleValue}
        selectedCount={selectedBookIds.size}
        onBatchAddTag={handleBatchAddTag}
        onBatchRemoveTag={handleBatchRemoveTag}
        onBatchDelete={handleBatchDelete}
        onStartEditingTitle={startEditingTitle}
        onUpdateTitle={handleUpdateTitle}
        onSetEditTitleValue={setEditTitleValue}
        onSetTaggingFromMenu={setTaggingFromMenu}
        onSetEditingTitle={setEditingTitle}
        onExitSelectionMode={exitSelectionMode}
      />

      {showUploadModal && (
        <BookUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      <QuickTagModal
        isOpen={showQuickTagModal}
        onClose={() => setShowQuickTagModal(false)}
        onTagApplied={() => loadData(true)}
        initialTag={quickTagInitialTag}
      />

      <style>{tagLibraryStyles}</style>
    </div>
  );
};

export default TagLibraryView;
