import React from 'react';
import '../styles/loading-book.css';

interface LoadingBookProps {
  size?: number;
  text?: string;
}

const PAGE_COUNT = 18;

const LoadingBook: React.FC<LoadingBookProps> = ({ size = 32, text }) => {
  const scale = size / 32;

  return (
    <div className="loading-book">
      <div
        className="loading-book-page"
        style={{
          width: size,
          height: size * 24 / 32,
        }}
      >
        <div
          className="book"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
          }}
        >
          <div className="inner">
            <div className="left" />
            <div className="middle" />
            <div className="right" />
          </div>
          <ul>
            {Array.from({ length: PAGE_COUNT }, (_, i) => (
              <li key={i} />
            ))}
          </ul>
        </div>
      </div>
      {text && <p className="loading-book-text">{text}</p>}
    </div>
  );
};

export default React.memo(LoadingBook);
