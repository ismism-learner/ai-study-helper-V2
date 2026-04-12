import React, { useEffect, useRef } from 'react';
import { BookDocument } from '../../types';
import { BookOpen, CheckSquare, Square } from 'lucide-react';

interface TagBookCardProps {
  book: BookDocument;
  isSelected: boolean;
  isSelectionMode: boolean;
  cardRefs: Map<string, HTMLDivElement>;
  onCardClick: (book: BookDocument, e: React.MouseEvent) => void;
  onCardContextMenu: (e: React.MouseEvent, book: BookDocument) => void;
}

const TagBookCard: React.FC<TagBookCardProps> = ({
  book,
  isSelected,
  isSelectionMode,
  cardRefs,
  onCardClick,
  onCardContextMenu,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cardRef.current) {
      cardRefs.set(book.id, cardRef.current);
    }
    return () => {
      cardRefs.delete(book.id);
    };
  }, [book.id, cardRefs]);

  return (
    <div style={{ display: 'contents' }}>
      <div
        ref={cardRef}
        className={`taglib-book-card ${isSelected ? 'taglib-selected' : ''}`}
        onClick={(e) => onCardClick(book, e)}
        onContextMenu={(e) => onCardContextMenu(e, book)}
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

export default TagBookCard;
