import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BookDocument } from '../types';
import { bookApi } from '../api';
import { X, Search, Loader2, Tag as TagIcon, CheckSquare, Square, GripVertical } from 'lucide-react';

interface QuickTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTagApplied: () => void;
  initialTag?: string;
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

const QuickTagModal: React.FC<QuickTagModalProps> = ({ isOpen, onClose, onTagApplied, initialTag }) => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<BookDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tagHistory, setTagHistory] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  
  const modalRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
  });
  const positionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('tagHistory');
      if (stored) {
        try {
          setTagHistory(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse tag history:', e);
        }
      }
      setKeyword(initialTag || '');
      setResults([]);
      setSelectedIds(new Set());
      setTagInput('');
      
      positionRef.current = { x: 0, y: 0 };
      if (modalRef.current) {
        modalRef.current.style.transform = 'translate(0px, 0px)';
      }
      
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, initialTag]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current.isDragging) return;
      
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      
      const newX = dragState.current.offsetX + dx;
      const newY = dragState.current.offsetY + dy;
      
      positionRef.current = { x: newX, y: newY };
      if (modalRef.current) {
        modalRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
      }
    };

    const handleMouseUp = () => {
      dragState.current.isDragging = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: positionRef.current.x,
      offsetY: positionRef.current.y
    };
  };

  const saveTagToHistory = (tag: string) => {
    const updated = [tag, ...tagHistory.filter(t => t !== tag)].slice(0, 50);
    setTagHistory(updated);
    localStorage.setItem('tagHistory', JSON.stringify(updated));
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await bookApi.quickSearch(keyword.trim(), initialTag || undefined);
      setResults(response.data.books);
      setSelectedIds(new Set(response.data.books.map(b => b.id)));
    } catch (error) {
      console.error('Quick tag search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && initialTag) {
      handleSearch();
    }
  }, [isOpen, initialTag]);

  const toggleSelect = (bookId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(results.map(b => b.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const [applying, setApplying] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleApplyTag = async (tag: string) => {
    if (selectedIds.size === 0 || !tag.trim()) return;
    
    const bookIds = Array.from(selectedIds);
    
    setApplying(true);
    try {
      await bookApi.batchTag(bookIds, tag.trim(), 'add');
      saveTagToHistory(tag.trim());
      setTagInput('');
      setSuccessMsg(`已为 ${bookIds.length} 本书添加标签「${tag.trim()}」`);
      setTimeout(() => setSuccessMsg(''), 2000);
      onTagApplied();
    } catch (error) {
      console.error('Batch tag failed:', error);
      alert('批量打标签失败');
    } finally {
      setApplying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      handleApplyTag(tagInput.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={modalRef}
      className="quick-tag-floating-window"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(0px, 0px)',
        zIndex: 1000,
      }}
    >
      <div className="quick-tag-header" ref={dragRef} onMouseDown={handleDragStart}>
        <div className="drag-handle">
          <GripVertical size={16} />
        </div>
        <TagIcon size={16} />
        <span>{initialTag ? `打标: ${initialTag === '__untagged__' ? '未分类' : initialTag}` : '快速打标签'}</span>
        <span className="selected-count">{selectedIds.size}/{results.length} 已选</span>
        <button className="close-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="quick-tag-body">
        <div className="search-row">
          <input
            ref={searchInputRef}
            type="text"
            placeholder={initialTag ? "在当前范围内搜索..." : "输入关键词搜索书名或作者..."}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={loading || !keyword.trim()}
          >
            {loading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
            搜索
          </button>
        </div>

        {results.length > 0 && (
          <>
            <div className="results-toolbar">
              <button className="btn btn-sm btn-secondary" onClick={selectAll}>
                全选
              </button>
              <button className="btn btn-sm btn-secondary" onClick={deselectAll}>
                取消全选
              </button>
            </div>

            <div className="results-list">
              {results.map(book => (
                <div 
                  key={book.id} 
                  className={`result-item ${selectedIds.has(book.id) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(book.id)}
                >
                  <div className="checkbox">
                    {selectedIds.has(book.id) ? (
                      <CheckSquare size={16} className="checked" />
                    ) : (
                      <Square size={16} />
                    )}
                  </div>
                  <div className="result-info">
                    <div className="result-title">{book.title}</div>
                    <div className="result-meta">
                      <span className="result-author">{book.author || '未知作者'}</span>
                      <div className="result-tags">
                        {(book.tags || []).slice(0, 3).map((tag, i) => (
                          <span key={i} className="mini-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="tag-input-row">
              <input
                type="text"
                placeholder="输入标签名，按 Enter 应用..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                disabled={applying}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleApplyTag(tagInput)}
                disabled={selectedIds.size === 0 || !tagInput.trim() || applying}
              >
                {applying ? <Loader2 size={14} className="spin" /> : '应用'}
              </button>
            </div>

            {successMsg && (
              <div className="success-message">
                ✓ {successMsg}
              </div>
            )}

            {tagHistory.length > 0 && (
              <div className="tag-history">
                <label>历史标签：</label>
                <div className="history-tags">
                  {tagHistory.slice(0, 8).map((tag, i) => (
                    <button
                      key={i}
                      className="history-tag-btn"
                      onClick={() => handleApplyTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default QuickTagModal;
