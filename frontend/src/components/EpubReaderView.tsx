import React, { useState, useEffect, useRef, useCallback } from 'react';
import ePub, { Rendition, NavItem, Book } from 'epubjs';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  List,
  Maximize2,
  Minimize2,
  Download,
  Sun,
  Moon,
  BookOpen,
  Loader2,
  GripVertical,
  X
} from 'lucide-react';
import { BookDocument } from '../types';
import PDFNotesPanel from './PDFNotesPanel';

interface EpubReaderViewProps {
  book: BookDocument;
  fileUrl: string;
  onBack: () => void;
}

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28];
const THEMES = [
  { name: 'light', bg: '#ffffff', color: '#1a1a2e', toolbarBg: '#ffffff' },
  { name: 'sepia', bg: '#f4ecd8', color: '#5b4636', toolbarBg: '#f9f3e8' },
  { name: 'dark', bg: '#1e293b', color: '#e2e8f0', toolbarBg: '#0f172a' },
];

const EpubReaderView: React.FC<EpubReaderViewProps> = ({ book, fileUrl, onBack }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [themeIndex, setThemeIndex] = useState(2);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<string>('');
  const [currentSpineIndex, setCurrentSpineIndex] = useState(0);
  const [totalSpineItems, setTotalSpineItems] = useState(0);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);
  
  const [showNotes, setShowNotes] = useState(false);
  const [showMiniToc, setShowMiniToc] = useState(false);
  
  const [miniTocPosition, setMiniTocPosition] = useState({ x: 0, y: 0 });
  const [isDraggingMiniToc, setIsDraggingMiniToc] = useState(false);
  const [miniTocDragOffset, setMiniTocDragOffset] = useState({ x: 0, y: 0 });
  const miniTocRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showMiniToc && miniTocPosition.x === 0 && miniTocPosition.y === 0) {
      setMiniTocPosition({ x: window.innerWidth - 260, y: 80 });
    }
  }, [showMiniToc]);

  const handleMiniTocMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.mini-toc-close, .mini-toc-item')) {
      return;
    }
    
    if (miniTocRef.current) {
      const rect = miniTocRef.current.getBoundingClientRect();
      setMiniTocDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDraggingMiniToc(true);
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingMiniToc) {
        const newX = e.clientX - miniTocDragOffset.x;
        const newY = e.clientY - miniTocDragOffset.y;
        
        const maxX = window.innerWidth - 260;
        const maxY = window.innerHeight - 200;
        
        setMiniTocPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingMiniToc(false);
    };

    if (isDraggingMiniToc) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingMiniToc, miniTocDragOffset]);

  const goNextRef = useRef<(() => void) | null>(null);
  const goPrevRef = useRef<(() => void) | null>(null);
  const showTocRef = useRef(false);
  const showNotesRef = useRef(false);

  useEffect(() => {
    showTocRef.current = showMiniToc;
  }, [showMiniToc]);

  useEffect(() => {
    showNotesRef.current = showNotes;
  }, [showNotes]);

  const goNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const goPrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  useEffect(() => {
    goNextRef.current = goNext;
    goPrevRef.current = goPrev;
  }, [goNext, goPrev]);

  useEffect(() => {
    if (!viewerRef.current) return;

    const initBook = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const ePubBook = ePub(fileUrl);
        bookRef.current = ePubBook;

        const rendition = ePubBook.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: 'scrolled-doc',
        });

        renditionRef.current = rendition;

        const loadingTimeout = setTimeout(() => {
          console.log('EPUB loading timeout, forcing ready');
          setIsLoading(false);
        }, 5000);

        rendition.on('rendered', () => {
          console.log('EPUB rendered');
          clearTimeout(loadingTimeout);
          setIsLoading(false);
        });

        rendition.on('displayed', () => {
          console.log('EPUB displayed');
          clearTimeout(loadingTimeout);
          setIsLoading(false);
        });

        rendition.on('relocated', (location: any) => {
          setCurrentLocation(location.start?.cfi || '');
          
          const spine = bookRef.current?.spine;
          const nav = bookRef.current?.navigation;
          
          if (spine && nav) {
            const item = spine.get(location.start);
            if (item) {
              setCurrentSpineIndex(item.index);
              setTotalSpineItems(spine.length);
              
              const tocItems = nav.toc || [];
              setTotalChapters(tocItems.length);
              
              if (tocItems.length > 0) {
                const currentHref = (item.href || '').split('#')[0];
                let found = false;
                
                for (let i = 0; i < tocItems.length; i++) {
                  const tocItem = tocItems[i];
                  const tocHref = (tocItem.href || '').split('#')[0];
                  
                  if (tocHref && currentHref === tocHref) {
                    setCurrentChapter(tocItem.label);
                    setCurrentChapterIndex(i + 1);
                    found = true;
                    break;
                  }
                }
                
                if (!found) {
                  const tocSpineMap: { index: number; label: string; chapterIndex: number }[] = [];
                  
                  for (let i = 0; i < tocItems.length; i++) {
                    const tocItem = tocItems[i];
                    const tocHref = (tocItem.href || '').split('#')[0];
                    
                    for (let j = 0; j < spine.length; j++) {
                      const spineItem = spine.get(j);
                      if (spineItem && spineItem.href) {
                        const spineHref = spineItem.href.split('#')[0];
                        if (spineHref === tocHref) {
                          tocSpineMap.push({
                            index: j,
                            label: tocItem.label,
                            chapterIndex: i + 1
                          });
                          break;
                        }
                      }
                    }
                  }
                  
                  tocSpineMap.sort((a, b) => a.index - b.index);
                  
                  let currentChapterInfo = null;
                  for (let i = tocSpineMap.length - 1; i >= 0; i--) {
                    if (item.index >= tocSpineMap[i].index) {
                      currentChapterInfo = tocSpineMap[i];
                      break;
                    }
                  }
                  
                  if (currentChapterInfo) {
                    setCurrentChapter(currentChapterInfo.label);
                    setCurrentChapterIndex(currentChapterInfo.chapterIndex);
                  } else if (item.index === 0) {
                    setCurrentChapter('封面');
                    setCurrentChapterIndex(0);
                  } else {
                    setCurrentChapter('');
                    setCurrentChapterIndex(0);
                  }
                }
              }
            }
          }
        });

        rendition.on('error', (err: any) => {
          console.error('EPUB render error:', err);
          clearTimeout(loadingTimeout);
          setError('渲染 EPUB 内容时出错');
          setIsLoading(false);
        });

        const nav = await ePubBook.loaded.navigation;
        setToc(nav.toc || []);
        setTotalChapters(nav.toc?.length || 0);

        await rendition.display();

      } catch (err: any) {
        console.error('EPUB load error:', err);
        setError(err.message || '无法加载 EPUB 文件');
        setIsLoading(false);
      }
    };

    initBook();

    return () => {
      if (bookRef.current) {
        bookRef.current.destroy();
      }
    };
  }, [fileUrl]);

  useEffect(() => {
    if (!renditionRef.current) return;
    const theme = THEMES[themeIndex];

    renditionRef.current.themes.register('theme-' + theme.name, {
      'body': {
        'background': theme.bg + ' !important',
        'color': theme.color + ' !important',
        'font-family': '"Microsoft YaHei", "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif !important',
        'line-height': '1.8 !important',
        'padding': '40px 30px !important',
      },
      'p': {
        'color': theme.color + ' !important',
        'line-height': '1.8 !important',
        'margin': '1em 0 !important',
      },
      'h1, h2, h3, h4, h5, h6': {
        'color': theme.color + ' !important',
        'margin': '1.5em 0 0.5em !important',
      },
      'a': {
        'color': '#3b82f6 !important',
      },
      '::selection': {
        'background': 'rgba(59, 130, 246, 0.3)',
      },
    });

    renditionRef.current.themes.select('theme-' + theme.name);
  }, [themeIndex]);

  useEffect(() => {
    if (!renditionRef.current) return;
    renditionRef.current.themes.fontSize(`${fontSize}px`);
  }, [fontSize]);

  const goToTocItem = useCallback((href: string) => {
    renditionRef.current?.display(href);
  }, []);

  const handleFontSizeChange = (delta: number) => {
    const currentIndex = FONT_SIZES.indexOf(fontSize);
    const newIndex = Math.max(0, Math.min(FONT_SIZES.length - 1, currentIndex + delta));
    setFontSize(FONT_SIZES[newIndex]);
  };

  const cycleTheme = () => {
    setThemeIndex((prev) => (prev + 1) % THEMES.length);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = book.original_filename || `${book.title}.epub`;
    link.click();
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const handleToolbarMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.toolbar-btn, .nav-btn, input, .zoom-controls')) {
      return;
    }
    
    if (toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDraggingToolbar(true);
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingToolbar) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        
        const maxX = window.innerWidth - 400;
        const maxY = window.innerHeight - 80;
        
        setToolbarPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingToolbar(false);
    };

    if (isDraggingToolbar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingToolbar, dragOffset]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case 'ArrowRight':
        goNext();
        break;
      case 'ArrowLeft':
        goPrev();
        break;
      case '+':
      case '=':
        handleFontSizeChange(1);
        break;
      case '-':
        handleFontSizeChange(-1);
        break;
      case 'Escape':
        if (isFullscreen) handleFullscreen();
        else onBack();
        break;
    }
  }, [goNext, goPrev, isFullscreen, onBack]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const currentTheme = THEMES[themeIndex];

  const renderTocItems = (items: NavItem[], level: number = 0): React.ReactNode => {
    return items.map((item, index) => (
      <React.Fragment key={`${level}-${index}`}>
        <button
          className={`mini-toc-item ${currentChapter === item.label ? 'active' : ''}`}
          onClick={() => goToTocItem(item.href)}
          style={{
            paddingLeft: `${level * 12 + 8}px`,
          }}
        >
          <span className="toc-bullet">•</span>
          <span className="toc-text">{item.label}</span>
        </button>
        {item.subitems && item.subitems.length > 0 && renderTocItems(item.subitems, level + 1)}
      </React.Fragment>
    ));
  };

  if (error) {
    return (
      <div className="epub-reader-container">
        <div className="book-reader-error">
          <BookOpen size={64} strokeWidth={1} />
          <h3>无法加载 EPUB 文件</h3>
          <p className="error-message">{error}</p>
          <div className="error-actions">
            <button className="btn btn-primary" onClick={handleDownload}>
              <Download size={16} /> 下载文件
            </button>
            <button className="btn btn-secondary" onClick={onBack}>返回</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="epub-reader-container book-reader-view"
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: currentTheme.bg,
        color: currentTheme.color,
        transition: 'background 0.3s ease, color 0.3s ease',
      }}
    >
      <div 
        ref={toolbarRef}
        className={`floating-toolbar ${isDraggingToolbar ? 'dragging' : ''}`}
        style={{
          left: toolbarPosition.x,
          top: toolbarPosition.y,
          cursor: isDraggingToolbar ? 'grabbing' : 'default',
          background: currentTheme.toolbarBg,
        }}
        onMouseDown={handleToolbarMouseDown}
      >
        <div className="toolbar-drag-handle">
          <GripVertical size={16} />
        </div>
        
        <div className="toolbar-left">
          <button className="toolbar-btn back-btn" onClick={onBack} title="返回">
            <ArrowLeft size={16} />
          </button>
          <div className="book-title-mini">
            <span>{book.title}</span>
          </div>
        </div>

        <div className="toolbar-center">
          <button className="nav-btn" onClick={goPrev} title="上一页">
            <ChevronLeft size={16} />
          </button>
          <button className="nav-btn" onClick={goNext} title="下一页">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="toolbar-right">
          <div className="zoom-controls">
            <button className="toolbar-btn" onClick={() => handleFontSizeChange(-1)} title="缩小字体">
              <ZoomOut size={14} />
            </button>
            <span className="zoom-level">{fontSize}</span>
            <button className="toolbar-btn" onClick={() => handleFontSizeChange(1)} title="放大字体">
              <ZoomIn size={14} />
            </button>
          </div>

          <button className="toolbar-btn" onClick={cycleTheme} title={`切换主题 (${currentTheme.name})`}>
            {themeIndex === 2 ? <Moon size={14} /> : <Sun size={14} />}
          </button>

          <button 
            className={`toolbar-btn ${showMiniToc ? 'active' : ''}`} 
            onClick={() => setShowMiniToc(!showMiniToc)} 
            title="目录"
          >
            <List size={14} />
          </button>

          <button 
            className={`toolbar-btn ${showNotes ? 'active' : ''}`} 
            onClick={() => setShowNotes(!showNotes)} 
            title="笔记"
          >
            <BookOpen size={14} />
          </button>

          <button className="toolbar-btn" onClick={handleFullscreen} title="全屏">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button className="toolbar-btn" onClick={handleDownload} title="下载">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="epub-content-wrapper">
        {isLoading && (
          <div className="reader-loading-overlay">
            <div className="loading-spinner" />
            <p>正在加载 EPUB...</p>
          </div>
        )}

        <div
          ref={viewerRef}
          className="epub-viewer-area"
        />
      </div>

      {showMiniToc && toc.length > 0 && (
        <div className="epub-mini-toc">
          <div className="mini-toc-header">
            <List size={14} />
            <span>目录</span>
            <button className="mini-toc-close" onClick={() => setShowMiniToc(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="mini-toc-current">
            <span className="current-label">当前:</span>
            <span className="current-chapter">{currentChapter || `第 ${currentSpineIndex + 1} 章`}</span>
          </div>
          <div className="mini-toc-list">
            {renderTocItems(toc)}
          </div>
        </div>
      )}

      {showNotes && (
        <PDFNotesPanel
          documentId={book.id}
          bookId={book.id}
          currentPage={currentSpineIndex + 1}
          onClose={() => setShowNotes(false)}
        />
      )}
    </div>
  );
};

export default EpubReaderView;
