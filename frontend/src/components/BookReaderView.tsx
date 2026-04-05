import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { BookDocument } from '../types';
import { bookApi, pdfOcrApi } from '../api';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize2, Minimize2, FileText, Download, RefreshCw, BookOpen, ChevronLeft, ChevronRight, GripVertical, ScanText, X, Wand2 } from 'lucide-react';
import PDFNotesPanel from './PDFNotesPanel';
import EpubReaderView from './EpubReaderView';
import PDFOCRModal from './PDFOCRModal';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface BookReaderViewProps {
  book: BookDocument;
  onBack: () => void;
  initialPage?: number;
}

const BUFFER_PAGES = 3;
const PAGE_HEIGHT_ESTIMATE = 800;

const SUPPORTED_EXTENSIONS = ['pdf'];

const getFileExtension = (filePath: string, originalFilename: string | null): string => {
  if (originalFilename) {
    const ext = originalFilename.split('.').pop()?.toLowerCase() || '';
    if (ext) return ext;
  }
  return filePath.split('.').pop()?.toLowerCase() || '';
};

const isSupportedFormat = (ext: string): boolean => {
  return SUPPORTED_EXTENSIONS.includes(ext);
};

const BookReaderView: React.FC<BookReaderViewProps> = ({ book: propsBook, onBack, initialPage }) => {
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
  const [showPDFNotes, setShowPDFNotes] = useState(false);
  const [book] = useState<BookDocument>(propsBook);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [pageHeights, setPageHeights] = useState<Map<number, number>>(new Map());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');
  
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [showOCRPanel, setShowOCRPanel] = useState(false);
  const [autoFixMode, setAutoFixMode] = useState(false);
  const [fixNotification, setFixNotification] = useState<string | null>(null);
  const [showTagDetector, setShowTagDetector] = useState(false);
  const [detectedTags, setDetectedTags] = useState<{ text: string; count: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ocrPanelRef = useRef<HTMLDivElement>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const currentPageRef = useRef<number>(1);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const readingStartTimeRef = useRef<number>(Date.now());
  const lastSaveTimeRef = useRef<number>(Date.now());
  const accumulatedSecondsRef = useRef<number>(0);
  const isScrollingProgrammatically = useRef<boolean>(false);

  const pdfContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (showOCRPanel) {
      (pdfScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    } else {
      (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [showOCRPanel]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    const targetPage = initialPage || book.last_read_page || 1;
    setCurrentPage(targetPage);
    currentPageRef.current = targetPage;
    setVisiblePages(new Set());
    setPageHeights(new Map());
    readingStartTimeRef.current = Date.now();
    lastSaveTimeRef.current = Date.now();
    accumulatedSecondsRef.current = 0;
    
    return () => {
      const readingSeconds = Math.floor((Date.now() - readingStartTimeRef.current) / 1000);
      if (readingSeconds > 5) {
        bookApi.updateReadingProgress(book.id, currentPageRef.current, readingSeconds).catch(console.error);
      }
    };
  }, [book.id, initialPage]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - lastSaveTimeRef.current) / 1000);
      
      if (elapsed >= 30) {
        accumulatedSecondsRef.current += elapsed;
        lastSaveTimeRef.current = now;
        
        bookApi.updateReadingProgress(book.id, currentPageRef.current, elapsed).catch(console.error);
      }
    }, 30000);
    
    return () => clearInterval(interval);
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
  const fileExtension = getFileExtension(book.file_path, book.original_filename);
  const isPdfFile = isSupportedFormat(fileExtension);

  useEffect(() => {
    const updateWidth = () => {
      const container = showOCRPanel ? pdfScrollRef.current : scrollContainerRef.current;
      if (container) {
        setContainerWidth(container.clientWidth - 40);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [showOCRPanel]);

  useEffect(() => {
    const container = showOCRPanel ? pdfScrollRef.current : scrollContainerRef.current;
    if (container) {
      setContainerWidth(container.clientWidth - 40);
    }
  }, [scale, showOCRPanel]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    setErrorDetails(null);
    setRetryCount(0);
    
    const targetPage = book.last_read_page || 1;
    
    const initialVisible = new Set<number>();
    for (let i = 1; i <= Math.min(BUFFER_PAGES + 2, numPages); i++) {
      initialVisible.add(i);
    }
    for (let i = Math.max(1, targetPage - BUFFER_PAGES); i <= Math.min(numPages, targetPage + BUFFER_PAGES); i++) {
      initialVisible.add(i);
    }
    setVisiblePages(initialVisible);
    
    if (targetPage > 1 && targetPage <= numPages) {
      const scrollToTarget = () => {
        const pageElement = pageRefs.current.get(targetPage);
        if (pageElement && scrollContainerRef.current) {
          isScrollingProgrammatically.current = true;
          pageElement.scrollIntoView({ behavior: 'instant', block: 'start' });
          setCurrentPage(targetPage);
          currentPageRef.current = targetPage;
          setTimeout(() => {
            isScrollingProgrammatically.current = false;
          }, 100);
          return true;
        }
        return false;
      };
      
      const checkAndScroll = (attempts: number) => {
        if (attempts <= 0) return;
        if (!scrollToTarget()) {
          setTimeout(() => checkAndScroll(attempts - 1), 100);
        }
      };
      
      setTimeout(() => checkAndScroll(10), 100);
    }
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
    const downloadName = book.original_filename || `${book.title}.${fileExtension || 'pdf'}`;
    link.download = downloadName;
    link.click();
  };

  const handleOCRComplete = useCallback((text: string) => {
    console.log('handleOCRComplete called with text length:', text?.length);
    setShowOCRModal(false);
    if (text && text.trim()) {
      setOcrText(text);
      setShowOCRPanel(true);
      setTimeout(() => {
        if (pdfScrollRef.current) {
          pdfScrollRef.current.scrollTop = 0;
        }
        if (ocrPanelRef.current) {
          ocrPanelRef.current.scrollTop = 0;
        }
      }, 100);
    } else {
      console.log('OCR text is empty, not showing panel');
    }
  }, []);

  const fixLineBreaksInText = useCallback((text: string): string => {
    const lines = text.split('\n');
    if (lines.length <= 1) return text;
    
    const isChineseChar = (char: string): boolean => {
      if (!char) return false;
      const code = char.charCodeAt(0);
      return (code >= 0x4E00 && code <= 0x9FFF) || 
             (code >= 0x3400 && code <= 0x4DBF) ||
             (code >= 0x20000 && code <= 0x2A6DF);
    };
    
    const isSentenceEnd = (char: string): boolean => {
      const endPunct = '。！？…」』】）';
      return endPunct.includes(char);
    };
    
    const result: string[] = [];
    let currentMergedLine = lines[0];
    
    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currentLine = lines[i];
      
      const lastChar = prevLine.trim().slice(-1);
      const firstChar = currentLine.trim()[0];
      
      const shouldMerge = 
        isChineseChar(lastChar) && 
        !isSentenceEnd(lastChar) &&
        isChineseChar(firstChar);
      
      if (shouldMerge) {
        currentMergedLine += currentLine;
      } else {
        result.push(currentMergedLine);
        currentMergedLine = currentLine;
      }
    }
    
    result.push(currentMergedLine);
    
    return result.join('\n');
  }, []);

  const detectChapterTags = useCallback((text: string, threshold: number = 3): { text: string; count: number }[] => {
    const lines = text.split('\n');
    const lineCounts = new Map<string, number>();
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.length > 0 && trimmed.length < 100) {
        lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
      }
    });
    
    const tags: { text: string; count: number }[] = [];
    lineCounts.forEach((count, text) => {
      if (count >= threshold) {
        tags.push({ text, count });
      }
    });
    
    return tags.sort((a, b) => b.count - a.count);
  }, []);

  const saveOCRText = useCallback(async (text: string) => {
    if (!book.file_path || !text) return;
    try {
      await pdfOcrApi.saveOcrText(book.file_path, text);
      console.log('OCR text saved successfully');
    } catch (error) {
      console.error('Failed to save OCR text:', error);
    }
  }, [book.file_path]);

  const handleDetectTags = useCallback(() => {
    if (!ocrText) return;
    
    const tags = detectChapterTags(ocrText, 3);
    setDetectedTags(tags);
    setShowTagDetector(true);
    setSelectedTags(new Set());
  }, [ocrText, detectChapterTags]);

  const handleToggleTag = useCallback((tagText: string) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagText)) {
        newSet.delete(tagText);
      } else {
        newSet.add(tagText);
      }
      return newSet;
    });
  }, []);

  const handleDeleteSelectedTags = useCallback(async () => {
    if (!ocrText || selectedTags.size === 0) return;
    
    let newText = ocrText;
    selectedTags.forEach(tag => {
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escapedTag}$`, 'gm');
      newText = newText.replace(regex, '');
    });
    
    newText = newText.replace(/\n{3,}/g, '\n\n').trim();
    setOcrText(newText);
    await saveOCRText(newText);
    setFixNotification(`已删除 ${selectedTags.size} 个章节标签`);
    setTimeout(() => setFixNotification(null), 2000);
    
    setShowTagDetector(false);
    setSelectedTags(new Set());
    setDetectedTags([]);
  }, [ocrText, selectedTags, saveOCRText]);

  const handleSelectAllTags = useCallback(() => {
    if (selectedTags.size === detectedTags.length) {
      setSelectedTags(new Set());
    } else {
      setSelectedTags(new Set(detectedTags.map(t => t.text)));
    }
  }, [detectedTags, selectedTags.size]);

  const handleEnterEditMode = useCallback(() => {
    if (!ocrText) return;
    setEditText(ocrText);
    setEditMode(true);
    setAutoFixMode(false);
    setShowTagDetector(false);
  }, [ocrText]);

  const handleCloseOCRPanel = useCallback(async () => {
    if (ocrText) {
      await saveOCRText(ocrText);
    }
    setShowOCRPanel(false);
  }, [ocrText, saveOCRText]);

  const handleRedoOCR = useCallback(async () => {
    if (!book.file_path) return;
    
    try {
      await pdfOcrApi.deleteOcrText(book.file_path);
      console.log('OCR files deleted, reopening OCR modal');
      setOcrText(null);
      setShowOCRPanel(false);
      setShowOCRModal(true);
    } catch (error) {
      console.error('Failed to delete OCR files:', error);
    }
  }, [book.file_path]);

  const handleExitEditMode = useCallback(async (save: boolean) => {
    if (save && editText !== ocrText) {
      setOcrText(editText);
      await saveOCRText(editText);
      setFixNotification('已保存编辑');
      setTimeout(() => setFixNotification(null), 2000);
    }
    setEditMode(false);
    setEditText('');
    setSearchText('');
    setSearchResults([]);
    setCurrentSearchIndex(-1);
  }, [editText, ocrText, saveOCRText]);

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
    if (!text.trim() || !editText) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }
    
    const indices: number[] = [];
    let index = 0;
    const lowerText = editText.toLowerCase();
    const lowerSearch = text.toLowerCase();
    
    while ((index = lowerText.indexOf(lowerSearch, index)) !== -1) {
      indices.push(index);
      index += 1;
    }
    
    setSearchResults(indices);
    setCurrentSearchIndex(indices.length > 0 ? 0 : -1);
  }, [editText]);

  const scrollToSearchResult = useCallback((index: number) => {
    if (!textareaRef.current || index === undefined || searchText.length === 0) return;
    
    const textarea = textareaRef.current;
    textarea.focus();
    textarea.setSelectionRange(index, index + searchText.length);
    
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 25;
    const textBefore = editText.substring(0, index);
    const linesBefore = textBefore.split('\n').length;
    const scrollTop = (linesBefore - 1) * lineHeight - textarea.clientHeight / 2;
    
    textarea.scrollTop = Math.max(0, scrollTop);
  }, [editText, searchText]);

  const handleNextSearch = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSearchResult(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  const handlePrevSearch = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSearchResult(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  const handleOCRTextSelection = useCallback(async () => {
    if (!autoFixMode || !ocrText) return;
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const selectedText = selection.toString();
    if (!selectedText || selectedText.length < 2) {
      setFixNotification('请选择至少2个字符');
      setTimeout(() => setFixNotification(null), 2000);
      return;
    }
    
    const fixedText = fixLineBreaksInText(selectedText);
    
    if (fixedText !== selectedText) {
      const newOcrText = ocrText.replace(selectedText, fixedText);
      setOcrText(newOcrText);
      await saveOCRText(newOcrText);
      setFixNotification(`已修复 ${selectedText.length} 个字符`);
    } else {
      setFixNotification('未检测到需要修复的换行');
    }
    
    selection.removeAllRanges();
    setTimeout(() => setFixNotification(null), 2000);
  }, [autoFixMode, ocrText, fixLineBreaksInText, saveOCRText]);

  useEffect(() => {
    const loadExistingOCRText = async () => {
      if (!book.file_path) return;
      
      try {
        const response = await pdfOcrApi.hasOcrText(book.file_path);
        if (response.data.has_ocr_text) {
          const textResponse = await pdfOcrApi.getOcrText(book.file_path);
          console.log('Loaded existing OCR text, length:', textResponse.data?.length);
          setOcrText(textResponse.data);
        }
      } catch (error) {
        console.log('No existing OCR text found');
      }
    };
    
    loadExistingOCRText();
  }, [book.file_path]);

  const scrollToPage = useCallback((pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > numPages) return;
    
    const pageElement = pageRefs.current.get(pageNumber);
    if (pageElement && scrollContainerRef.current) {
      isScrollingProgrammatically.current = true;
      scrollContainerRef.current.scrollTop = pageElement.offsetTop - 20;
      setCurrentPage(pageNumber);
      currentPageRef.current = pageNumber;
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 100);
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
    const scrollContainer = showOCRPanel ? pdfScrollRef.current : scrollContainerRef.current;
    if (!scrollContainer || numPages === 0) return;

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;
      
      if (pageRefs.current.size === 0) return;
      
      const containerRect = scrollContainer.getBoundingClientRect();
      let currentPageNum = 1;
      let minDistance = Infinity;
      
      pageRefs.current.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - containerRect.top);
        if (distance < minDistance) {
          minDistance = distance;
          currentPageNum = parseInt(element.getAttribute('data-page') || '1');
        }
      });
      
      if (currentPageNum !== currentPageRef.current) {
        currentPageRef.current = currentPageNum;
        setCurrentPage(currentPageNum);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [numPages, showOCRPanel]);

  useEffect(() => {
    const scrollContainer = showOCRPanel ? pdfScrollRef.current : scrollContainerRef.current;
    if (numPages === 0 || !scrollContainer) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const scaledBufferHeight = BUFFER_PAGES * PAGE_HEIGHT_ESTIMATE * scale;

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
          setVisiblePages(prev => {
            const combined = new Set<number>();
            newVisiblePages.forEach(page => {
              for (let i = Math.max(1, page - BUFFER_PAGES); i <= Math.min(numPages, page + BUFFER_PAGES); i++) {
                combined.add(i);
              }
            });
            prev.forEach(page => combined.add(page));
            return combined;
          });
        }
      },
      {
        root: scrollContainer,
        rootMargin: `${scaledBufferHeight}px 0px`,
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
  }, [numPages, scale, showOCRPanel]);

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

  if (fileUrl && !isPdfFile) {
    return (
      <EpubReaderView
        book={book}
        fileUrl={fileUrl}
        onBack={onBack}
      />
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
              <span className="total-pages">{numPages || '...'}</span>
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
          
          <button 
            className={`toolbar-btn ${showOCRPanel ? 'active' : ''}`} 
            onClick={() => {
              if (ocrText) {
                setShowOCRPanel(!showOCRPanel);
              } else {
                setShowOCRModal(true);
              }
            }} 
            title={ocrText ? (showOCRPanel ? "隐藏 OCR 文本" : "显示 OCR 文本") : "OCR 文字识别"}
          >
            <ScanText size={14} />
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

      <div className={`reader-content ${showOCRPanel ? 'with-ocr' : ''}`}>
        {!fileUrl && (
          <div className="pdf-placeholder">
            <FileText size={80} strokeWidth={1} />
            <h3>未找到PDF文件</h3>
            <p>该书籍没有关联的PDF文件</p>
          </div>
        )}

        {fileUrl && (
          <div 
            className={`pdf-viewer-container ${showOCRPanel ? 'with-ocr-panel' : ''}`}
            ref={pdfContainerRef}
          >
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
                const pageWidth = showOCRPanel 
                  ? Math.min(containerWidth, (window.innerWidth - 120) / 2)
                  : Math.min(containerWidth, window.innerWidth - 80);
                
                return (
                  <div 
                    key={pageNumber}
                    className="pdf-page-wrapper"
                    data-page={pageNumber}
                    ref={(el) => {
                      if (el) pageRefs.current.set(pageNumber, el);
                    }}
                    style={{ 
                      minHeight: isVisible ? 'auto' : estimatedHeight,
                      width: pageWidth
                    }}
                  >
                    {isVisible ? (
                      <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        width={pageWidth}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="pdf-page"
                        onRenderSuccess={onPageRenderSuccess(pageNumber)}
                        onRenderError={onPageRenderError(pageNumber)}
                        loading={
                          <div 
                            className="page-loading-placeholder"
                            style={{ width: pageWidth, height: estimatedHeight }}
                          >
                            <div className="loading-spinner-small" />
                          </div>
                        }
                      />
                    ) : (
                      <div 
                        className="page-placeholder" 
                        style={{ 
                          width: pageWidth, 
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
        
        {showOCRPanel && ocrText && (
          <div className="ocr-text-panel" ref={ocrPanelRef}>
            <div className="ocr-text-header">
              <h3>OCR 识别文字</h3>
              <div className="ocr-header-actions">
                {!editMode && (
                  <>
                    <button 
                      className="auto-fix-btn"
                      onClick={handleEnterEditMode}
                      title="进入编辑模式"
                    >
                      <FileText size={16} />
                      <span>编辑</span>
                    </button>
                    <button 
                      className="auto-fix-btn"
                      onClick={handleRedoOCR}
                      title="删除当前 OCR 结果并重新进行 OCR"
                    >
                      <RefreshCw size={16} />
                      <span>重来</span>
                    </button>
                    <button 
                      className="auto-fix-btn"
                      onClick={handleDetectTags}
                      title="检测并删除重复的章节标签"
                    >
                      <ScanText size={16} />
                      <span>标签</span>
                    </button>
                    <button 
                      className={`auto-fix-btn ${autoFixMode ? 'active' : ''}`}
                      onClick={() => setAutoFixMode(!autoFixMode)}
                      title={autoFixMode ? "关闭自动修复模式" : "开启自动修复模式 - 选择文本后自动合并换行"}
                    >
                      <Wand2 size={16} />
                      <span>{autoFixMode ? '修复中' : '修复'}</span>
                    </button>
                  </>
                )}
                {editMode && (
                  <>
                    <button 
                      className="auto-fix-btn save-btn"
                      onClick={() => handleExitEditMode(true)}
                      title="保存编辑"
                    >
                      <span>✓ 保存</span>
                    </button>
                    <button 
                      className="auto-fix-btn"
                      onClick={() => handleExitEditMode(false)}
                      title="取消编辑"
                    >
                      <span>✕ 取消</span>
                    </button>
                  </>
                )}
                <button 
                  className="close-ocr-btn"
                  onClick={handleCloseOCRPanel}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            {fixNotification && (
              <div className="fix-notification">
                {fixNotification}
              </div>
            )}
            {autoFixMode && !editMode && (
              <div className="auto-fix-hint">
                选择需要修复换行的文本，松开鼠标后自动合并
              </div>
            )}
            {editMode && (
              <div className="auto-fix-hint edit-mode-hint">
                编辑模式 - 可自由修改文字内容
              </div>
            )}
            {editMode && (
              <div className="ocr-search-bar">
                <input
                  type="text"
                  className="ocr-search-input"
                  placeholder="搜索关键词..."
                  value={searchText}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                {searchText && (
                  <div className="ocr-search-nav">
                    <span className="search-count">
                      {searchResults.length > 0 ? `${currentSearchIndex + 1}/${searchResults.length}` : '无结果'}
                    </span>
                    <button 
                      className="search-nav-btn"
                      onClick={handlePrevSearch}
                      disabled={searchResults.length === 0}
                      title="上一个"
                    >
                      ↑
                    </button>
                    <button 
                      className="search-nav-btn"
                      onClick={handleNextSearch}
                      disabled={searchResults.length === 0}
                      title="下一个"
                    >
                      ↓
                    </button>
                  </div>
                )}
              </div>
            )}
            {showTagDetector && !editMode && (
              <div className="tag-detector-panel">
                <div className="tag-detector-header">
                  <span>检测到 {detectedTags.length} 个重复标签</span>
                  <div className="tag-detector-actions">
                    <button className="tag-action-btn" onClick={handleSelectAllTags}>
                      {selectedTags.size === detectedTags.length ? '取消全选' : '全选'}
                    </button>
                    <button 
                      className="tag-action-btn delete"
                      onClick={handleDeleteSelectedTags}
                      disabled={selectedTags.size === 0}
                    >
                      删除选中 ({selectedTags.size})
                    </button>
                    <button className="tag-action-btn" onClick={() => setShowTagDetector(false)}>
                      关闭
                    </button>
                  </div>
                </div>
                <div className="tag-list">
                  {detectedTags.map((tag, index) => (
                    <div 
                      key={index}
                      className={`tag-item ${selectedTags.has(tag.text) ? 'selected' : ''}`}
                      onClick={() => handleToggleTag(tag.text)}
                    >
                      <span className="tag-checkbox">{selectedTags.has(tag.text) ? '☑' : '☐'}</span>
                      <span className="tag-text">{tag.text}</span>
                      <span className="tag-count">×{tag.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {editMode ? (
              <textarea
                ref={textareaRef}
                className="ocr-edit-textarea"
                value={editText}
                onChange={(e) => {
                  setEditText(e.target.value);
                  if (searchText) {
                    handleSearch(searchText);
                  }
                }}
                placeholder="在此编辑文字..."
                spellCheck={false}
              />
            ) : (
              <div 
                className="ocr-text-content"
                onMouseUp={handleOCRTextSelection}
              >
                <pre>{ocrText}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {showPDFNotes && (
        <PDFNotesPanel
          documentId={book.id}
          bookId={book.id}
          currentPage={currentPage}
          onClose={() => setShowPDFNotes(false)}
          onNoteClick={(note) => scrollToPage(note.page_number)}
        />
      )}

      {showOCRModal && (
        <PDFOCRModal
          isOpen={showOCRModal}
          onClose={() => setShowOCRModal(false)}
          filePath={book.file_path || ''}
          bookTitle={book.title}
          onOCRComplete={handleOCRComplete}
        />
      )}
    </div>
  );
};

export default BookReaderView;
