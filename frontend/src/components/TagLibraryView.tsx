import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BookDocument } from '../types';
import { bookApi, timePeriodApi } from '../api';
import TimelineView from './TimelineView';
import BookUploadModal from './BookUploadModal';
import BatchUploadModal from './BatchUploadModal';
import BookManageView from './BookManageView';
import QuickTagModal from './QuickTagModal';
import QuarkUploadModal from './QuarkUploadModal';
import TagKnowledgeGraphPanel from './TagKnowledgeGraphPanel';
import { useQuarkUpload } from '../hooks';
import {
  TagBookCard,
  BookSelectionContextMenu,
  TagLibraryHeader,
  SelectionRectOverlay,
  tagLibraryStyles,
} from './tagLibrary';
import { BookOpen, Tag, Clock, ChevronUp, ChevronDown, Tag as TagIcon, Layers, Upload } from 'lucide-react';
import LoadingBook from './LoadingBook';

interface TagLibraryViewProps {
  selectedTag: string | null;
  onBookSelect: (book: BookDocument) => void;
  onTagSelect?: (tag: string) => void;
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

const TagLibraryView: React.FC<TagLibraryViewProps> = ({ selectedTag, onBookSelect, onTagSelect }) => {
  const [allBooks, setAllBooks] = useState<BookDocument[]>([]);
  const [timePeriods, setTimePeriods] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [viewMode] = useState<'timeline' | 'grid'>(selectedTag ? 'timeline' : 'grid');
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('main');
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [scale, setScale] = useState(1);
  const [showBooks, setShowBooks] = useState(true);

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

  const {
    showQuarkModal,
    setShowQuarkModal,
    quarkUploading,
    quarkUploadResults,
    quarkUploadProgress,
    handleUploadToQuark,
    handleCopyShareUrl,
    handleCopyAllShareUrls,
  } = useQuarkUpload();

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
    <div className="country-detail-view" onMouseUp={handleGridMouseUp} onMouseMove={handleGridMouseMove}>
      <TagLibraryHeader
        selectedTag={selectedTag}
        isSelectionMode={isSelectionMode}
        selectedBookIdsSize={selectedBookIds.size}
        filterYear={filterYear}
        allYears={allYears}
        viewMode={viewMode}
        editMode={editMode}
        scale={scale}
        showBooks={showBooks}
        onFilterYearChange={setFilterYear}
        onToggleSelectionMode={() => setIsSelectionMode(true)}
        onExitSelectionMode={exitSelectionMode}
        onShowBatchUploadModal={() => setShowBatchUploadModal(true)}
        onShowUploadModal={() => setShowUploadModal(true)}
        onShowManageView={() => setCurrentView('manage')}
        onShowQuarkModal={() => setShowQuarkModal(true)}
        onShowQuickTagModal={(tag = '') => {
          setQuickTagInitialTag(tag);
          setShowQuickTagModal(true);
        }}
        onShowGraphView={selectedTag ? () => setShowGraphView(true) : undefined}
        onToggleEditMode={() => setEditMode(!editMode)}
        onZoomOut={() => setScale(prev => Math.max(0.2, prev - 0.1))}
        onZoomIn={() => setScale(prev => Math.min(3, prev + 0.1))}
        onResetZoom={() => setScale(1)}
        onToggleShowBooks={() => setShowBooks(!showBooks)}
      />

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
                  onClick={() => {
                    if (onTagSelect) {
                      onTagSelect(group.tag === '未分类' ? '' : group.tag);
                    } else {
                      toggleTag(group.tag);
                    }
                  }}
                  onDoubleClick={() => toggleTag(group.tag)}
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

      {showBatchUploadModal && (
        <BatchUploadModal
          onClose={() => setShowBatchUploadModal(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      <QuarkUploadModal
        show={showQuarkModal}
        uploading={quarkUploading}
        results={quarkUploadResults}
        progress={quarkUploadProgress}
        onClose={() => setShowQuarkModal(false)}
        onUpload={() => handleUploadToQuark({ selectedTag, displayBooks })}
        onCopyShareUrl={handleCopyShareUrl}
        onCopyAllShareUrls={handleCopyAllShareUrls}
        selectedTag={selectedTag}
        displayBooks={displayBooks}
      />

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
