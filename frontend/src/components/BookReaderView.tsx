import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { BookDocument } from '../types';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize2, Minimize2, FileText, Download, Clock, RefreshCw, Globe, BookOpen, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import TimePeriodsManager from './TimePeriodsManager';
import WorldPanel from './WorldPanel';
import PDFNotesPanel from './PDFNotesPanel';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface BookReaderViewProps {
  book: BookDocument;
  onBack: () => void;
}

const BUFFER_PAGES = 3;
const PAGE_HEIGHT_ESTIMATE = 800;

const BookReaderView: React.FC<BookReaderViewProps> = ({ book: propsBook, onBack }) => {
  const pdfOptions = useMemo(() => ({
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: false,
    fontExtraProperties: true,
    wasmUrl: '/',
    disableRange: false,
    disableStream: false,
    disableAutoFetch: true,
  }), []);
  
  const [scale, setScale] = useState(0.75);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showTimePeriods, setShowTimePeriods] = useState(false);
  const [showWorldPanel, setShowWorldPanel] = useState(false);
  const [showPDFNotes, setShowPDFNotes] = useState(false);
  const [book, setBook] = useState<BookDocument>(propsBook);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [pageHeights, setPageHeights] = useState<Map<number, number>>(new Map());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');
  
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const currentPageRef = useRef<number>(1);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    setCurrentPage(1);
    currentPageRef.current = 1;
    setVisiblePages(new Set());
    setPageHeights(new Map());
  }, [book.id]);

  const buildFileUrl = useCallback((filePath: string | null): string | null => {
    if (!filePath) return null;
    
    let normalizedPath = filePath.replace(/\\/g, '/');
    
    if (normalizedPath.startsWith('uploads/')) {
      normalizedPath = normalizedPath.substring('uploads/'.length);
    } else if (normalizedPath.startsWith('/uploads/')) {
      normalizedPath = normalizedPath.substring('/uploads/'.length);
    }
    
    if (normalizedPath.startsWith('books/')) {
      return `/uploads/${normalizedPath}`;
    }
    
    return `/uploads/books/${normalizedPath}`;
  }, []);
  
  const fileUrl = buildFileUrl(book.file_path);

  useEffect(() => {
    const updateWidth = () => {
      if (scrollContainerRef.current) {
        setContainerWidth(scrollContainerRef.current.clientWidth - 40);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    setErrorDetails(null);
    setRetryCount(0);
    
    const initialVisible = new Set<number>();
    for (let i = 1; i <= Math.min(BUFFER_PAGES + 2, numPages); i++) {
      initialVisible.add(i);
    }
    setVisiblePages(initialVisible);
  };

  const onDocumentLoadError = (error: Error) => {
    if (error.name === 'AbortError' || error.message.includes('abort')) {
      console.log('PDF loading was aborted (this is normal when navigating away)');
      return;
    }
    
    console.error('PDF load error:', error);
    setIsLoading(false);
    
    let errorMessage = '无法加载PDF文件';
    let details = '';
    
    if (error.message.includes('Missing PDF') || error.message.includes('404')) {
      errorMessage = 'PDF文件不存在';
      details = `文件路径: ${book.file_path}`;
    } else if (error.message.includes('Invalid PDF')) {
      errorMessage = 'PDF文件已损坏或格式不正确';
      details = '请尝试重新上传该文件';
    } else if (error.message.includes('password')) {
      errorMessage = 'PDF文件需要密码';
      details = '该PDF文件受密码保护，无法直接打开';
    } else {
      details = error.message;
    }
    
    setError(errorMessage);
    setErrorDetails(details);
  };
  
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
    setErrorDetails(null);
    setIsLoading(true);
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const handleDownload = () => {
    if (!fileUrl) return;
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `${book.title}.pdf`;
    link.click();
  };

  const scrollToPage = useCallback((pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > numPages) return;
    
    const pageElement = pageRefs.current.get(pageNumber);
    if (pageElement && scrollContainerRef.current) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(pageNumber);
      currentPageRef.current = pageNumber;
    }
  }, [numPages]);

  const handlePrevPage = useCallback(() => {
    const newPage = currentPageRef.current - 1;
    if (newPage >= 1) {
      scrollToPage(newPage);
    }
  }, [scrollToPage]);

  const handleNextPage = useCallback(() => {
    const newPage = currentPageRef.current + 1;
    if (newPage <= numPages) {
      scrollToPage(newPage);
    }
  }, [numPages, scrollToPage]);

  const handleJumpPage = useCallback(() => {
    const pageNumber = parseInt(jumpPageInput);
    if (!isNaN(pageNumber) && pageNumber > 0 && pageNumber <= numPages) {
      scrollToPage(pageNumber);
      setJumpPageInput('');
    }
  }, [jumpPageInput, numPages, scrollToPage]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    
    switch (e.key) {
      case '+':
      case '=':
        handleZoomIn();
        break;
      case '-':
        handleZoomOut();
        break;
      case 'ArrowLeft':
        handlePrevPage();
        break;
      case 'ArrowRight':
        handleNextPage();
        break;
      case 'Escape':
        if (isFullscreen) {
          handleFullscreen();
        } else {
          onBack();
        }
        break;
    }
  }, [isFullscreen, handlePrevPage, handleNextPage, onBack]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || numPages === 0) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const estimatedPageHeight = PAGE_HEIGHT_ESTIMATE * scale;
      
      const estimatedPage = Math.floor(scrollTop / estimatedPageHeight) + 1;
      const clampedPage = Math.max(1, Math.min(numPages, estimatedPage));
      
      if (clampedPage !== currentPageRef.current) {
        currentPageRef.current = clampedPage;
        setCurrentPage(clampedPage);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [numPages, scale]);

  useEffect(() => {
    if (numPages === 0 || !scrollContainerRef.current) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const newVisiblePages = new Set<number>();
        
        entries.forEach((entry) => {
          const pageNumber = parseInt(entry.target.getAttribute('data-page') || '0');
          if (pageNumber > 0 && entry.isIntersecting) {
            newVisiblePages.add(pageNumber);
          }
        });

        if (newVisiblePages.size > 0) {
          setVisiblePages(() => {
            const combined = new Set<number>();
            newVisiblePages.forEach(page => {
              for (let i = Math.max(1, page - BUFFER_PAGES); i <= Math.min(numPages, page + BUFFER_PAGES); i++) {
                combined.add(i);
              }
            });
            return combined;
          });
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: `${BUFFER_PAGES * PAGE_HEIGHT_ESTIMATE}px 0px`,
        threshold: 0.01
      }
    );

    observerRef.current = observer;

    const currentPageRefs = pageRefs.current;
    currentPageRefs.forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [numPages]);

  const onPageRenderSuccess = (pageNumber: number) => (page: { height: number; width: number }) => {
    setPageHeights(prev => {
      const newMap = new Map(prev);
      newMap.set(pageNumber, page.height);
      return newMap;
    });
  };

  const onPageRenderError = (pageNumber: number) => (error: Error) => {
    console.error(`Page ${pageNumber} render error:`, error);
  };

  const allPages = useMemo(() => {
    return numPages > 0 ? Array.from({ length: numPages }, (_, i) => i + 1) : [];
  }, [numPages]);

  const shouldRenderPage = useCallback((pageNumber: number) => {
    return visiblePages.has(pageNumber);
  }, [visiblePages]);

  const getPageHeight = useCallback((pageNumber: number) => {
    return pageHeights.get(pageNumber) || PAGE_HEIGHT_ESTIMATE;
  }, [pageHeights]);

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

  if (error) {
    return (
      <div className="book-reader-error">
        <FileText size={64} strokeWidth={1} />
        <h3>无法加载文档</h3>
        <p className="error-message">{error}</p>
        {errorDetails && <p className="error-details">{errorDetails}</p>}
        <div className="error-actions">
          {retryCount < 3 && (
            <button className="btn btn-primary" onClick={handleRetry}>
              <RefreshCw size={16} />
              重试
            </button>
          )}
          <button className="btn btn-secondary" onClick={onBack}>
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="book-reader-view" ref={containerRef}>
      <div 
        ref={toolbarRef}
        className={`floating-toolbar ${isDraggingToolbar ? 'dragging' : ''}`}
        style={{
          left: toolbarPosition.x,
          top: toolbarPosition.y,
          cursor: isDraggingToolbar ? 'grabbing' : 'default'
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
          <div className="page-navigation-toolbar">
            <button 
              className="nav-btn" 
              onClick={handlePrevPage} 
              disabled={currentPage <= 1}
              title="上一页"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="page-input-group">
              <input
                type="number"
                className="page-jump-input"
                value={jumpPageInput}
                onChange={(e) => setJumpPageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleJumpPage();
                  }
                }}
                placeholder={currentPage.toString()}
                min="1"
                max={numPages}
              />
              <span className="page-separator">/</span>
              <span className="total-pages">{numPages || '?'}</span>
            </div>
            <button 
              className="nav-btn" 
              onClick={handleNextPage} 
              disabled={currentPage >= numPages}
              title="下一页"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <div className="zoom-controls">
            <button className="toolbar-btn" onClick={handleZoomOut} title="缩小">
              <ZoomOut size={14} />
            </button>
            <span className="zoom-level">{Math.round(scale * 100)}%</span>
            <button className="toolbar-btn" onClick={handleZoomIn} title="放大">
              <ZoomIn size={14} />
            </button>
          </div>
          
          <button className="toolbar-btn" onClick={handleFullscreen} title="全屏">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button className="toolbar-btn" onClick={handleDownload} title="下载">
            <Download size={14} />
          </button>
          
          <button className="toolbar-btn" onClick={() => setShowTimePeriods(!showTimePeriods)} title="时间段管理">
            <Clock size={14} />
          </button>
          
          <button className="toolbar-btn" onClick={() => setShowWorldPanel(!showWorldPanel)} title="世界面板">
            <Globe size={14} />
          </button>
          
          <button 
            className={`toolbar-btn ${showPDFNotes ? 'active' : ''}`} 
            onClick={() => setShowPDFNotes(!showPDFNotes)} 
            title="PDF 笔记"
          >
            <BookOpen size={14} />
          </button>
        </div>
      </div>

      <div className="reader-content" ref={scrollContainerRef}>
        {!fileUrl && (
          <div className="pdf-placeholder">
            <FileText size={80} strokeWidth={1} />
            <h3>未找到PDF文件</h3>
            <p>该书籍没有关联的PDF文件</p>
          </div>
        )}

        {fileUrl && (
          <div className="pdf-viewer-container">
            {isLoading && (
              <div className="reader-loading-overlay">
                <div className="loading-spinner" />
                <p>加载文档中...</p>
              </div>
            )}
            <Document
              key={`${fileUrl}-${retryCount}`}
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading=""
              options={pdfOptions}
            >
              {allPages.map((pageNumber) => {
                const isVisible = shouldRenderPage(pageNumber);
                const estimatedHeight = getPageHeight(pageNumber) * scale;
                
                return (
                  <div 
                    key={pageNumber}
                    className="pdf-page-wrapper"
                    data-page={pageNumber}
                    ref={(el) => {
                      if (el) pageRefs.current.set(pageNumber, el);
                    }}
                    style={{ minHeight: isVisible ? 'auto' : estimatedHeight }}
                  >
                    {isVisible ? (
                      <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        width={containerWidth}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="pdf-page"
                        onRenderSuccess={onPageRenderSuccess(pageNumber)}
                        onRenderError={onPageRenderError(pageNumber)}
                        loading={
                          <div 
                            className="page-loading-placeholder"
                            style={{ width: containerWidth, height: estimatedHeight }}
                          >
                            <div className="loading-spinner-small" />
                          </div>
                        }
                      />
                    ) : (
                      <div 
                        className="page-placeholder" 
                        style={{ 
                          width: containerWidth, 
                          height: estimatedHeight
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </Document>
          </div>
        )}
      </div>

      {showTimePeriods && (
        <div className="time-periods-panel">
          <TimePeriodsManager
            book={book}
            onUpdate={setBook}
          />
        </div>
      )}

      {showWorldPanel && (
        <WorldPanel
          book={book}
          currentPage={currentPage}
          onJumpToPage={scrollToPage}
          onClose={() => setShowWorldPanel(false)}
        />
      )}

      {showPDFNotes && (
        <PDFNotesPanel
          documentId={book.id}
          currentPage={currentPage}
          onClose={() => setShowPDFNotes(false)}
          onNoteClick={(note) => scrollToPage(note.page_number)}
        />
      )}
    </div>
  );
};

export default BookReaderView;
