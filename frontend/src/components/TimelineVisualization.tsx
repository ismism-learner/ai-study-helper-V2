import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BookDocument, TimePeriod, BookTimePeriod } from '../types';

interface TimelineVisualizationProps {
  books: BookDocument[];
  timePeriods: TimePeriod[];
  onBookClick: (book: BookDocument) => void;
}

interface BookNode {
  book: BookDocument;
  x: number;
  y: number;
  color: string;
}

interface TimePeriodNode {
  period: TimePeriod;
  y: number;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const TimelineVisualization: React.FC<TimelineVisualizationProps> = ({
  books,
  timePeriods,
  onBookClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [hoveredBook, setHoveredBook] = useState<string | null>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const timelineWidth = 200;
  const periodHeight = 80;
  const headerHeight = 60;

  const sortedPeriods = useMemo(() => 
    [...timePeriods].sort((a, b) => (a.start_year || 0) - (b.start_year || 0)),
    [timePeriods]
  );

  const bookNodes: BookNode[] = useMemo(() => {
    const nodes: BookNode[] = [];
    const booksWithPeriods = books.filter(b => b.time_periods && b.time_periods.length > 0);
    
    booksWithPeriods.forEach((book, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      nodes.push({
        book,
        x: timelineWidth + 150 + col * 200,
        y: headerHeight + row * 120 + 60,
        color: COLORS[index % COLORS.length]
      });
    });
    
    return nodes;
  }, [books, timelineWidth]);

  const periodNodes: TimePeriodNode[] = useMemo(() => 
    sortedPeriods.map((period, index) => ({
      period,
      y: headerHeight + index * periodHeight + 40
    })),
    [sortedPeriods]
  );

  const getYearLabel = (year: number | null | undefined): string => {
    if (!year) return '';
    if (year === 0) return '公元元年';
    if (year < 0) return `公元前${Math.abs(year)}年`;
    return `${year}年`;
  };

  const generateBezierPath = (
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): string => {
    const midX = startX + (endX - startX) * 0.5;
    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  };

  const getBookPeriods = (book: BookDocument): BookTimePeriod[] => {
    return (book.time_periods || []) as BookTimePeriod[];
  };

  const getBooksForPeriod = (periodId: string): BookDocument[] => {
    return books.filter(book => 
      (book.time_periods || []).some((p) => p.id === periodId)
    );
  };

  const isPeriodHighlighted = (periodId: string): boolean => {
    if (selectedPeriod === periodId) return true;
    if (selectedBook) {
      const book = books.find(b => b.id === selectedBook);
      return (book?.time_periods || []).some((p) => p.id === periodId) || false;
    }
    if (hoveredBook) {
      const book = books.find(b => b.id === hoveredBook);
      return book?.time_periods?.some(p => p.id === periodId) || false;
    }
    return false;
  };

  const isBookHighlighted = (bookId: string): boolean => {
    if (selectedBook === bookId) return true;
    if (selectedPeriod) {
      const booksForPeriod = getBooksForPeriod(selectedPeriod);
      return booksForPeriod.some(b => b.id === bookId);
    }
    return false;
  };

  const handlePeriodClick = (periodId: string) => {
    setSelectedPeriod(selectedPeriod === periodId ? null : periodId);
    setSelectedBook(null);
  };

  const handleBookClick = (bookId: string) => {
    setSelectedBook(selectedBook === bookId ? null : bookId);
    setSelectedPeriod(null);
  };

  const totalHeight = Math.max(
    periodNodes.length * periodHeight + headerHeight,
    bookNodes.length > 0 ? Math.ceil(bookNodes.length / 3) * 120 + headerHeight : 0
  );

  return (
    <div className="timeline-visualization" ref={containerRef}>
      <div className="timeline-header">
        <h3>历史时期与书籍关联可视化</h3>
        <p className="hint">点击历史时期或书籍查看关联关系</p>
      </div>
      
      <div className="visualization-container" style={{ height: totalHeight }}>
        <svg width={containerWidth} height={totalHeight}>
          <defs>
            {bookNodes.map(node => (
              <linearGradient
                key={`gradient-${node.book.id}`}
                id={`gradient-${node.book.id}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor={node.color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={node.color} stopOpacity="0.8" />
              </linearGradient>
            ))}
          </defs>

          {periodNodes.map((periodNode) => {
            const isHighlighted = isPeriodHighlighted(periodNode.period.id);
            return (
              <g key={periodNode.period.id}>
                <line
                  x1={timelineWidth - 20}
                  y1={periodNode.y}
                  x2={timelineWidth}
                  y2={periodNode.y}
                  stroke={isHighlighted ? '#3b82f6' : '#cbd5e1'}
                  strokeWidth={isHighlighted ? 3 : 2}
                />
                <g
                  className="period-node"
                  onClick={() => handlePeriodClick(periodNode.period.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={10}
                    y={periodNode.y - 25}
                    width={timelineWidth - 40}
                    height={50}
                    rx={8}
                    fill={isHighlighted ? '#eff6ff' : 'white'}
                    stroke={isHighlighted ? '#3b82f6' : '#e2e8f0'}
                    strokeWidth={isHighlighted ? 2 : 1}
                  />
                  <text
                    x={timelineWidth / 2}
                    y={periodNode.y - 5}
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight={600}
                    fill={isHighlighted ? '#1e40af' : '#1e293b'}
                  >
                    {periodNode.period.name}
                  </text>
                  <text
                    x={timelineWidth / 2}
                    y={periodNode.y + 12}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#64748b"
                  >
                    {getYearLabel(periodNode.period.start_year)} - {getYearLabel(periodNode.period.end_year)}
                  </text>
                </g>
              </g>
            );
          })}

          <line
            x1={timelineWidth - 10}
            y1={headerHeight}
            x2={timelineWidth - 10}
            y2={totalHeight - 20}
            stroke="#cbd5e1"
            strokeWidth={3}
          />

          {bookNodes.map(node => {
            const periods = getBookPeriods(node.book);
            const isHighlighted = isBookHighlighted(node.book.id);
            
            return periods.map((period) => {
              const periodNode = periodNodes.find(p => p.period.id === period.id);
              if (!periodNode) return null;
              
              const path = generateBezierPath(
                timelineWidth,
                periodNode.y,
                node.x - 60,
                node.y
              );
              
              return (
                <path
                  key={`${node.book.id}-${period.id}`}
                  d={path}
                  fill="none"
                  stroke={isHighlighted || isPeriodHighlighted(period.id) ? node.color : '#cbd5e1'}
                  strokeWidth={isHighlighted || isPeriodHighlighted(period.id) ? 3 : 1.5}
                  strokeOpacity={isHighlighted || isPeriodHighlighted(period.id) ? 1 : 0.3}
                />
              );
            });
          })}

          {bookNodes.map(node => {
            const isHighlighted = isBookHighlighted(node.book.id);
            
            return (
              <g
                key={node.book.id}
                className="book-node"
                onClick={() => handleBookClick(node.book.id)}
                onDoubleClick={() => onBookClick(node.book)}
                onMouseEnter={() => setHoveredBook(node.book.id)}
                onMouseLeave={() => setHoveredBook(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={node.x - 60}
                  y={node.y - 40}
                  width={120}
                  height={80}
                  rx={8}
                  fill="white"
                  stroke={isHighlighted ? node.color : '#e2e8f0'}
                  strokeWidth={isHighlighted ? 3 : 1}
                  filter={isHighlighted ? 'url(#shadow)' : undefined}
                />
                
                {node.book.cover_image ? (
                  <image
                    href={node.book.cover_image}
                    x={node.x - 50}
                    y={node.y - 30}
                    width={40}
                    height={50}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <rect
                    x={node.x - 50}
                    y={node.y - 30}
                    width={40}
                    height={50}
                    rx={4}
                    fill="#f1f5f9"
                  />
                )}
                
                <text
                  x={node.x + 10}
                  y={node.y - 10}
                  fontSize={12}
                  fontWeight={600}
                  fill="#1e293b"
                >
                  {node.book.title.length > 8 
                    ? node.book.title.substring(0, 8) + '...' 
                    : node.book.title}
                </text>
                
                {node.book.author && (
                  <text
                    x={node.x + 10}
                    y={node.y + 10}
                    fontSize={10}
                    fill="#64748b"
                  >
                    {node.book.author.length > 6 
                      ? node.book.author.substring(0, 6) + '...' 
                      : node.book.author}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="visualization-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#3b82f6' }}></div>
          <span>点击历史时期查看关联书籍</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#10b981' }}></div>
          <span>点击书籍查看关联时期</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#f59e0b' }}></div>
          <span>双击书籍查看详情</span>
        </div>
      </div>
    </div>
  );
};

export default TimelineVisualization;
