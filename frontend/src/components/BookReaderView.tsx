import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { BookDocument } from '../types';
import { bookApi, pdfOcrApi, chapterNoteApi } from '../api';
import { cognitiveChainApi } from '../api/knowledgeGraph';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize2, Minimize2, FileText, Download, RefreshCw, BookOpen, ChevronLeft, ChevronRight, GripVertical, ScanText, Sparkles, MessageCircle, Network } from 'lucide-react';
import PDFNotesPanel from './PDFNotesPanel';
import ResizablePanels from './ResizablePanels';
import KnowledgeGraphPanel from './KnowledgeGraphPanel';
import AgentChatPanel from './AgentChatPanel';

const EpubReaderView = lazy(() => import('./EpubReaderView'));
import PDFOCRModal from './PDFOCRModal';
import ChapterNoteViewer from './ChapterNoteViewer';
import NoteCardPanel from './NoteCardPanel';
import LoadingBook from './LoadingBook';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '../styles/note-card.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface BookReaderViewProps {
  book: BookDocument;
  onBack: () => void;
  initialPage?: number;
}

const BUFFER_PAGES = 3;
const PAGE_HEIGHT_ESTIMATE = 800;

/**
 * 根据当前页码计算应渲染的页面集合
 * 逻辑：当前页 ± bufferPages，简单直接
 */
function getVisiblePagesFromPage(
  currentPageNum: number,
  totalPages: number,
  bufferPages: number
): Set<number> {
  const startPage = Math.max(1, currentPageNum - bufferPages);
  const endPage = Math.min(totalPages, currentPageNum + bufferPages);
  const result = new Set<number>();
  for (let i = startPage; i <= endPage; i++) {
    result.add(i);
  }
  return result;
}

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
  const visiblePagesRef = useRef<Set<number>>(new Set());
  const [visiblePagesKey, setVisiblePagesKey] = useState(0);
  void visiblePagesKey; // triggers re-render when visible pages change
  const pageHeightsRef = useRef<Map<number, number>>(new Map());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');
  
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [fixNotification, setFixNotification] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState<string>('');
  const [editChapters, setEditChapters] = useState<string[]>([]);
  const [editCurrentChapter, setEditCurrentChapter] = useState(0);
  const [ocrChapters, setOcrChapters] = useState<string[]>([]);
  const [currentOcrChapter, setCurrentOcrChapter] = useState(0);
  const [showChapterNav, setShowChapterNav] = useState(false);
  const [noteViewMode, setNoteViewMode] = useState(false);
  const [noteMarkdown, setNoteMarkdown] = useState<string | null>(null);
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [chapterNoteId, setChapterNoteId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<'ocr' | 'cards'>('ocr');
  const chapterNotesMapRef = useRef<Map<number, { chapterTitle: string; chapterIndex: number; markdownContent: string | null; isGenerating: boolean; noteId: string | null }>>(new Map());
  const [chapterNotesKey, setChapterNotesKey] = useState(0);
  void chapterNotesKey; // triggers re-render when chapter notes change
  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    selectedText: string;
    selectionStart?: number;
  } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [hasActiveChain, setHasActiveChain] = useState(false);
  const [isChainLoading, setIsChainLoading] = useState(false);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [activeChainId, setActiveChainId] = useState<string | null>(null);
  const [externalMessage, setExternalMessage] = useState<{ role: 'user' | 'assistant' | 'system'; content: string; nodeType?: string; chapterIndex?: number; knowledgeNodeId?: string } | null>(null);
  const [ocrFontSize, setOcrFontSize] = useState(16);
  const contextMenuRef = useRef<typeof contextMenu>(null);
  const updateContextMenu = useCallback((val: typeof contextMenu) => {
    contextMenuRef.current = val;
    setContextMenu(val);
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ocrPanelRef = useRef<HTMLDivElement>(null);
  const readerContentRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const currentPageRef = useRef<number>(1);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const readingStartTimeRef = useRef<number>(Date.now());
  const lastSaveTimeRef = useRef<number>(Date.now());
  const accumulatedSecondsRef = useRef<number>(0);
  const isScrollingProgrammatically = useRef<boolean>(false);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const editChaptersRef = useRef<string[]>([]);
  const editCurrentChapterRef = useRef<number>(0);

  const pdfContainerRef = useCallback((node: HTMLDivElement | null) => {
    // 找到实际的滚动容器：ResizablePanels 创建的 .panel-content
    // 它是 .panel-pdf-viewer 的父元素，拥有 overflow: auto
    const scrollContainer = node?.closest('.panel-content') as HTMLDivElement | null;
    (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = scrollContainer || node;
  }, []);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (pendingSelectionRef.current && textareaRef.current) {
      const { start, end } = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      const textarea = textareaRef.current;
      textarea.focus();
      textarea.setSelectionRange(start, end);
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 25;
      const textBefore = textarea.value.substring(0, start);
      const linesBefore = textBefore.split('\n').length;
      const scrollTop = (linesBefore - 1) * lineHeight - textarea.clientHeight / 2;
      textarea.scrollTop = Math.max(0, scrollTop);
    }
  }, [editCurrentChapter]);

  useEffect(() => {
    editChaptersRef.current = editChapters;
  }, [editChapters]);

  useEffect(() => {
    editCurrentChapterRef.current = editCurrentChapter;
  }, [editCurrentChapter]);

  useEffect(() => {
    const targetPage = initialPage || book.last_read_page || 1;
    setCurrentPage(targetPage);
    currentPageRef.current = targetPage;
    visiblePagesRef.current = new Set();
    setVisiblePagesKey(k => k + 1);
    pageHeightsRef.current = new Map();
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
      const container = scrollContainerRef.current;
      if (container) {
        setContainerWidth(container.clientWidth - 40);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      setContainerWidth(container.clientWidth - 40);
    }
  }, [scale]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    setErrorDetails(null);
    setRetryCount(0);
    
    const targetPage = initialPage || book.last_read_page || 1;
    
    const initialVisible = new Set<number>();
    for (let i = 1; i <= Math.min(BUFFER_PAGES + 2, numPages); i++) {
      initialVisible.add(i);
    }
    for (let i = Math.max(1, targetPage - BUFFER_PAGES); i <= Math.min(numPages, targetPage + BUFFER_PAGES); i++) {
      initialVisible.add(i);
    }
    visiblePagesRef.current = initialVisible;
    setVisiblePagesKey(k => k + 1);
    
    if (targetPage > 1 && targetPage <= numPages) {
      const scrollToTarget = () => {
        const pageElement = pageRefs.current.get(targetPage);
        const scrollContainer = scrollContainerRef.current;
        if (pageElement && scrollContainer) {
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

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      const timer = setTimeout(() => {
        const scrollWidth = container.scrollWidth;
        const clientWidth = container.clientWidth;
        if (scrollWidth > clientWidth) {
          container.scrollLeft = (scrollWidth - clientWidth) / 2;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scale]);

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
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = 0;
        }
        if (ocrPanelRef.current) {
          ocrPanelRef.current.scrollTop = 0;
        }
      }, 100);
    } else {
      console.log('OCR text is empty, not showing panel');
    }
  }, []);

  const parseChapters = useCallback((text: string): string[] => {
    const CHAPTER_MARKER = '====';
    const lines = text.split('\n');
    const chapters: string[] = [];
    let currentChapter: string[] = [];
    
    for (const line of lines) {
      if (line.trim().startsWith(CHAPTER_MARKER)) {
        const chapterContent = currentChapter.join('\n').trim();
        if (chapterContent || chapters.length > 0) {
          chapters.push(chapterContent);
        }
        currentChapter = [line.trim().substring(CHAPTER_MARKER.length)];
      } else {
        currentChapter.push(line);
      }
    }
    
    if (currentChapter.length > 0) {
      chapters.push(currentChapter.join('\n').trim());
    }
    
    while (chapters.length > 1 && chapters[chapters.length - 1] === '') {
      chapters.pop();
    }
    
    return chapters;
  }, []);

  /** Convert parseChapters output to edit format: re-add ==== prefix to chapters 1+ */
  const toEditChapters = useCallback((chapters: string[]): string[] => {
    if (chapters.length <= 1) return [...chapters];
    // If first chapter is empty (text starts with ====), omit it to avoid leading \n on reassembly
    const firstChapter = chapters[0] === '' ? [] : [chapters[0]];
    return [
      ...firstChapter,
      ...chapters.slice(chapters[0] === '' ? 1 : 1).map(ch => '====' + ch)
    ];
  }, []);

  /** Reassemble editChapters (with ==== prefixes) back into full OCR text */
  const reassembleFromEditChapters = useCallback((chapters: string[]): string => {
    return chapters
      .map(ch => ch.replace(/\n+$/, '').replace(/^\n+/, ''))
      .filter(ch => ch.length > 0)
      .join('\n')
      .replace(/\n+$/, '');
  }, []);

  useEffect(() => {
    if (ocrText) {
      const chapters = parseChapters(ocrText);
      // Filter out empty chapters for view mode display (keep them in edit mode for lossless round-trip)
      const displayChapters = chapters.filter(c => c.length > 0);
      setOcrChapters(prevChapters => {
        if (prevChapters.length === displayChapters.length) {
          return displayChapters;
        }
        setCurrentOcrChapter(0);
        return displayChapters;
      });
      setShowChapterNav(displayChapters.length > 1);
    } else {
      setOcrChapters([]);
      setShowChapterNav(false);
    }
  }, [ocrText, parseChapters]);

  const handleChapterChange = useCallback((chapterIndex: number) => {
    setCurrentOcrChapter(chapterIndex);
    setChapterNoteId(null);
    setNoteMarkdown(null);
    setNoteViewMode(false);
    if (ocrPanelRef.current) {
      ocrPanelRef.current.scrollTop = 0;
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
    
    const isComma = (char: string): boolean => {
      return char === '，' || char === ',';
    };
    
    const result: string[] = [];
    let currentMergedLine = lines[0];
    
    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currentLine = lines[i];
      
      const lastChar = prevLine.trim().slice(-1);
      const firstChar = currentLine.trim()[0];
      
      const shouldMerge = 
        (isChineseChar(lastChar) || isComma(lastChar)) && 
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

  const saveOCRText = useCallback(async (text: string) => {
    const clean = text
      .replace(/\n{3,}/g, '\n')
      .replace(/\n+$/, '')
      .replace(/^\n+/, '');
    if (!book.file_path || !clean) {
      return;
    }
    try {
      await pdfOcrApi.saveOcrText(book.file_path, clean);
    } catch (error) {
      console.error('[SAVE OCR TEXT] 保存失败:', error);
    }
  }, [book.file_path]);

  useEffect(() => {
    if (!editMode || !editText) return;
    const handleBeforeUnload = () => {
      saveOCRText(editText);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [editMode, editText, saveOCRText]);

  const handleEnterEditMode = useCallback(() => {
    if (!ocrText) return;
    setEditText(ocrText);
    const parsed = parseChapters(ocrText);
    const editFormat = toEditChapters(parsed);
    setEditChapters(editFormat);
    // Map currentOcrChapter (index in filtered display chapters) to editCurrentChapter (index in edit format)
    // ocrChapters = parsed.filter(non-empty), editChapters = toEditChapters(parsed)
    // We need to find which editChapters index corresponds to the currently viewed chapter
    const nonEmptyParsed = parsed.filter(c => c.length > 0);
    if (currentOcrChapter < nonEmptyParsed.length) {
      const targetContent = nonEmptyParsed[currentOcrChapter];
      // Find this content in editFormat
      const editIndex = editFormat.findIndex(ch => {
        // For chapters 1+ in editFormat, the ==== prefix is prepended, so compare after stripping it
        const chContent = ch.startsWith('====') ? ch : ch;
        return chContent === targetContent || ch === targetContent;
      });
      setEditCurrentChapter(editIndex >= 0 ? editIndex : 0);
    } else {
      setEditCurrentChapter(0);
    }
    setEditMode(true);
  }, [ocrText, currentOcrChapter, parseChapters, toEditChapters]);

  const handleRedoOCR = useCallback(async () => {
    if (!book.file_path) return;
    
    try {
      await pdfOcrApi.deleteOcrText(book.file_path);
      console.log('OCR files deleted, reopening OCR modal');
      setOcrText(null);
      setShowOCRModal(true);
    } catch (error) {
      console.error('Failed to delete OCR files:', error);
    }
  }, [book.file_path]);

  const handleExitEditMode = useCallback(async (save: boolean) => {
    if (save && editChapters.length > 0) {
      const fullText = reassembleFromEditChapters(editChapters);
      if (fullText !== ocrText) {
        setOcrText(fullText);
        await saveOCRText(fullText);
        setFixNotification('已保存编辑');
        setTimeout(() => setFixNotification(null), 2000);
      }
    }
    setEditMode(false);
    setEditText('');
    setEditChapters([]);
    setEditCurrentChapter(0);
  }, [editChapters, ocrText, saveOCRText, reassembleFromEditChapters]);

  const handleEditChapterChange = useCallback((newIndex: number) => {
    setEditCurrentChapter(newIndex);
    if (ocrPanelRef.current) {
      ocrPanelRef.current.scrollTop = 0;
    }
  }, []);

  const reparseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEditTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newEditChapters = [...editChaptersRef.current];
    newEditChapters[editCurrentChapterRef.current] = newValue;
    setEditChapters(newEditChapters);

    const newFullText = reassembleFromEditChapters(newEditChapters);
    setEditText(newFullText);

    const hasChapterMarker = newValue.includes('====');
    if (hasChapterMarker) {
      if (reparseDebounceRef.current) {
        clearTimeout(reparseDebounceRef.current);
      }
      reparseDebounceRef.current = setTimeout(() => {
        const parsedChapters = parseChapters(newFullText);
        const newEditFormat = toEditChapters(parsedChapters);
        if (newEditFormat.length !== newEditChapters.length) {
          const cursorPos = e.target.selectionStart;
          const textBeforeCursor = newValue.substring(0, cursorPos);
          const markersInCurrentBeforeCursor = (textBeforeCursor.match(/^====/gm) || []).length;
          const adjustedMarkers = editCurrentChapterRef.current > 0
            ? Math.max(0, markersInCurrentBeforeCursor - 1)
            : markersInCurrentBeforeCursor;
          const effectiveNewChapters = editCurrentChapterRef.current + 1 + adjustedMarkers;
          const newChapterIndex = Math.min(effectiveNewChapters - 1, newEditFormat.length - 1);
          setEditChapters(newEditFormat);
          setEditCurrentChapter(Math.max(0, newChapterIndex));
        }
      }, 500);
    }

    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
    }
    autoSaveDebounceRef.current = setTimeout(() => {
      saveOCRText(newFullText);
      setOcrText(newFullText);
    }, 500);
  }, [reassembleFromEditChapters, parseChapters, toEditChapters, saveOCRText]);

  const handleMergeNewlines = useCallback(() => {
    const chapters = editChaptersRef.current;
    if (chapters.length === 0) return;
    const merged = chapters.map((ch: string) => ch.replace(/\n{2,}/g, '\n'));
    const mergedText = reassembleFromEditChapters(merged);
    setEditChapters(merged);
    editChaptersRef.current = merged;
    setEditText(mergedText);
    setOcrText(mergedText);
    saveOCRText(mergedText);
    setFixNotification(`已合并全部 ${merged.length} 个章节的多余换行符`);
    setTimeout(() => setFixNotification(null), 2000);
  }, [reassembleFromEditChapters, saveOCRText]);

  const handleOCRTextSelection = useCallback(async () => {
    if (!ocrText) return;
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const selectedText = selection.toString();
    if (!selectedText || selectedText.length < 1) return;
  }, [ocrText]);

  const handleOCRContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!ocrText) return;
    
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    
    let selectionLineNumber: number | undefined = undefined;
    if (selection && selection.anchorNode && selectedText) {
      const preElement = (e.target as HTMLElement).closest('pre');
      if (preElement) {
        const range = selection.getRangeAt(0);
        const preRange = document.createRange();
        preRange.selectNodeContents(preElement);
        preRange.setEnd(range.startContainer, range.startOffset);
        const localText = preRange.toString();
        const localLineNumber = localText.split('\n').length;
        
        if (ocrChapters.length > 0 && currentOcrChapter > 0) {
          let prevLines = 0;
          for (let i = 0; i < currentOcrChapter; i++) {
            prevLines += ocrChapters[i].split('\n').length;
          }
          selectionLineNumber = prevLines + localLineNumber;
        } else {
          selectionLineNumber = localLineNumber;
        }
      }
    }
    
    updateContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      selectedText: selectedText,
      selectionStart: selectionLineNumber,
    });
  }, [ocrText, ocrChapters, currentOcrChapter]);

  const getTextPosition = useCallback((selectedText: string): number => {
    if (!ocrText || !selectedText) return 0;
    const index = ocrText.indexOf(selectedText.trim());
    return index >= 0 ? index : 0;
  }, [ocrText]);

  const handleChapterize = useCallback(async () => {
    console.log('[CHAPTERIZE] 开始章节化');
    if (!contextMenu?.selectedText || !ocrText) return;
    
    const CHAPTER_MARKER = '====';
    const selectedText = contextMenu.selectedText.trim();
    
    // selectionStart 现在是完整OCR文本中的行号
    const selectionLineNumber = contextMenu.selectionStart;
    console.log('[CHAPTERIZE] 选中行号:', selectionLineNumber);
    
    const lines = ocrText.split('\n');
    let found = false;
    let newChapterIndex = 0;
    let chapterCount = 0;
    let targetLineIndex = -1;
    
    // 如果有行号，直接使用行号定位（行号从1开始，索引从0开始）
    if (selectionLineNumber !== undefined && selectionLineNumber > 0) {
      targetLineIndex = selectionLineNumber - 1;
      console.log('[CHAPTERIZE] 目标行索引:', targetLineIndex);
    }
    
    // 如果找到了目标行，进行章节化
    if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
      console.log('[CHAPTERIZE] 目标行内容:', lines[targetLineIndex]?.slice(0, 50));
      
      const newLines = lines.map((line, index) => {
        if (line.trim().startsWith(CHAPTER_MARKER)) {
          chapterCount++;
        }
        
        // 只在目标行添加章节标记
        if (index === targetLineIndex && !line.trim().startsWith(CHAPTER_MARKER)) {
          found = true;
          newChapterIndex = chapterCount;
          return CHAPTER_MARKER + line;
        }
        return line;
      });
      
      if (found) {
        const newOcrText = newLines.join('\n');
        setOcrText(newOcrText);
        await saveOCRText(newOcrText);
        setFixNotification(`已添加章节标记 - 第 ${newChapterIndex + 1} 章`);
        setCurrentOcrChapter(newChapterIndex + 1);
      }
    } else {
      // 回退到原来的逻辑（如果位置计算失败）
      console.log('[CHAPTERIZE] 位置计算失败，使用回退逻辑');
      const normalizedSelected = selectedText.replace(/\s+/g, ' ').trim();
      
      const newLines = lines.map((line) => {
        if (line.trim().startsWith(CHAPTER_MARKER)) {
          chapterCount++;
        }
        const normalizedLine = line.replace(/\s+/g, ' ').trim();
        if (!found && (line.includes(selectedText) || normalizedLine.includes(normalizedSelected))) {
          found = true;
          if (!line.trim().startsWith(CHAPTER_MARKER)) {
            newChapterIndex = chapterCount;
            return CHAPTER_MARKER + line;
          }
        }
        return line;
      });
      
      if (found) {
        const newOcrText = newLines.join('\n');
        setOcrText(newOcrText);
        await saveOCRText(newOcrText);
        setFixNotification(`已添加章节标记 - 第 ${newChapterIndex + 1} 章`);
        setCurrentOcrChapter(newChapterIndex + 1);
      }
    }
    
    if (!found) {
      setFixNotification('未找到选中的文本');
    }
    
    updateContextMenu(null);
    setTimeout(() => setFixNotification(null), 2000);
  }, [contextMenu, ocrText, saveOCRText]);

  const handleQuickFix = useCallback(async () => {
    if (!contextMenu?.selectedText || !ocrText) return;
    
    const selectedText = contextMenu.selectedText;
    
    if (selectedText.length < 2) {
      setFixNotification('请选择至少2个字符');
      updateContextMenu(null);
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
    
    updateContextMenu(null);
    setTimeout(() => setFixNotification(null), 2000);
  }, [contextMenu, ocrText, fixLineBreaksInText, saveOCRText]);

  const handleAskQuestion = useCallback(() => {
    if (!contextMenu?.selectedText) return;
    setPendingQuestion(contextMenu.selectedText);
    updateContextMenu(null);
  }, [contextMenu]);

  const handleKnowledgeNodeClick = useCallback(async (node: { name: string; source_chapter_index?: number } | null) => {
    if (node) {
      console.log('选中节点:', node.name, node);
      const chapterIndex = node.source_chapter_index;
      if (typeof chapterIndex === 'number' && chapterIndex >= 0) {
        setCurrentOcrChapter(chapterIndex);
      }
      // 查找包含该概念的认知链，跳转到历史对话
      try {
        const res = await cognitiveChainApi.findChainsByConcept(node.name);
        const chains = res.data?.chains || [];
        if (chains.length > 0) {
          setActiveChainId(chains[0].id);
        }
      } catch (err) {
        console.error('查找概念关联认知链失败:', err);
      }
    }
  }, []);

  const handleQuickSummary = useCallback(async () => {
    if (!contextMenu?.selectedText || !book.id) return;
    
    const textPosition = contextMenu.selectionStart ?? getTextPosition(contextMenu.selectedText);
    const chapterIndex = ocrChapters.length > 0 ? currentOcrChapter : undefined;
    console.log('[QuickSummary] 发送参数:', { textPosition, chapterIndex, currentOcrChapter, ocrChaptersLength: ocrChapters.length });
    
    setIsChainLoading(true);
    setExternalMessage({ role: 'user', content: contextMenu.selectedText.slice(0, 50) + '...', nodeType: 'QuickSummary' });
    
    try {
      const { knowledgeGraphApi } = await import('../api/knowledgeGraph');
      const res = await knowledgeGraphApi.createQuickSummary({
        text: contextMenu.selectedText,
        book_id: book.id,
        book_title: book.title,
        text_position: textPosition,
        chapter_index: chapterIndex,
      });
      const node = res.data?.node;
      setExternalMessage({ 
        role: 'assistant', 
        content: `${node?.name || '快速梳理'}\n\n${node?.description || ''}`,
        nodeType: 'QuickSummary'
      });
      setGraphRefreshKey(k => k + 1);
    } catch (error) {
      console.error('快速梳理失败:', error);
      setExternalMessage({ role: 'system', content: '快速梳理失败', nodeType: 'QuickSummary' });
    } finally {
      setIsChainLoading(false);
      updateContextMenu(null);
    }
  }, [contextMenu, book.id, book.title, getTextPosition, ocrChapters.length, currentOcrChapter]);

  const handleFollowUpQuestion = useCallback(() => {
    if (!contextMenu?.selectedText) return;
    if (!hasActiveChain) {
      setFixNotification('请先创建认知链后再追问');
      updateContextMenu(null);
      setTimeout(() => setFixNotification(null), 2000);
      return;
    }
    setPendingQuestion(contextMenu.selectedText);
    updateContextMenu(null);
  }, [contextMenu, hasActiveChain]);

  const MAX_NOTE_CHARS = 8000;

  const handleGenerateNote = useCallback(async (targetChapter?: number) => {
    const chapterIdx = targetChapter ?? currentOcrChapter;
    const currentText = ocrChapters.length > 0 ? ocrChapters[chapterIdx] : ocrText;
    if (!currentText) return;

    const charCount = currentText.length;
    if (charCount > MAX_NOTE_CHARS) {
      alert(`当前文本共 ${charCount.toLocaleString()} 字，超过 ${MAX_NOTE_CHARS.toLocaleString()} 字限制。\n\n请先使用"章节化"功能将文本分章，再对单个章节制作笔记。\n\n分章节后，每个章节可单独整理，避免一次性消耗过多 Token。`);
      return;
    }

    const chapterTitle = ocrChapters.length > 0
      ? `${book.title} - 第${chapterIdx + 1}章`
      : book.title;

    chapterNotesMapRef.current = new Map(chapterNotesMapRef.current);
    chapterNotesMapRef.current.set(chapterIdx, { chapterTitle, chapterIndex: chapterIdx, markdownContent: null, isGenerating: true, noteId: null });
    setChapterNotesKey(k => k + 1);

    if (targetChapter === undefined) {
      setIsGeneratingNote(true);
      setNoteMarkdown(null);
      setNoteViewMode(true);
    }

    try {
      const createResponse = await chapterNoteApi.create({
        book_id: book.id,
        chapter_title: chapterTitle,
        original_text: currentText,
      });

      const noteId = createResponse.data.id;
      if (targetChapter === undefined) {
        setChapterNoteId(noteId);
      }

      const generateResponse = await chapterNoteApi.generate({
        original_text: currentText,
        chapter_title: chapterTitle,
      });

      const mdContent = generateResponse.data.markdown_content;

      chapterNotesMapRef.current = new Map(chapterNotesMapRef.current);
      chapterNotesMapRef.current.set(chapterIdx, { chapterTitle, chapterIndex: chapterIdx, markdownContent: mdContent, isGenerating: false, noteId });
      setChapterNotesKey(k => k + 1);

      if (targetChapter === undefined) {
        setNoteMarkdown(mdContent);
      }

      await chapterNoteApi.update(noteId, {
        markdown_content: mdContent,
        status: 'completed',
      });
    } catch (error: any) {
      console.error('Failed to generate note:', error);
      chapterNotesMapRef.current = new Map(chapterNotesMapRef.current);
      chapterNotesMapRef.current.set(chapterIdx, { chapterTitle, chapterIndex: chapterIdx, markdownContent: null, isGenerating: false, noteId: null });
      setChapterNotesKey(k => k + 1);
      if (targetChapter === undefined) {
        alert('生成笔记失败: ' + (error.response?.data?.detail || error.message));
        setNoteViewMode(false);
      }
    } finally {
      if (targetChapter === undefined) {
        setIsGeneratingNote(false);
      }
    }
  }, [ocrChapters, currentOcrChapter, ocrText, book.id, book.title]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenuRef.current?.show) {
        updateContextMenu(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const loadExistingOCRText = async () => {
      console.log('[LOAD OCR TEXT] 开始加载');
      console.log('[LOAD OCR TEXT] book.file_path:', book.file_path);
      if (!book.file_path) return;
      
      try {
        console.log('[LOAD OCR TEXT] 检查是否有 OCR 文本...');
        const response = await pdfOcrApi.hasOcrText(book.file_path);
        console.log('[LOAD OCR TEXT] hasOcrText 返回:', response.data);
        if (response.data.has_ocr_text) {
          console.log('[LOAD OCR TEXT] 获取 OCR 文本...');
          const textResponse = await pdfOcrApi.getOcrText(book.file_path);
          const normalizedText = textResponse.data.replace(/\n{3,}/g, '\n\n');
          console.log('[LOAD OCR TEXT] 加载成功, 长度:', normalizedText.length);
          console.log('[LOAD OCR TEXT] 文本预览:', normalizedText.substring(0, 100));
          console.log('[LOAD OCR TEXT] 包含 ==== 标记:', normalizedText.includes('===='));
          setOcrText(normalizedText);
        } else {
          console.log('[LOAD OCR TEXT] 没有 OCR 文本');
        }
      } catch (error) {
        console.log('[LOAD OCR TEXT] 加载失败:', error);
      }
    };
    
    loadExistingOCRText();
  }, [book.file_path]);

  const scrollToPage = useCallback((pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > numPages) return;
    
    const pageElement = pageRefs.current.get(pageNumber);
    const scrollContainer = scrollContainerRef.current;
    if (pageElement && scrollContainer) {
      isScrollingProgrammatically.current = true;
      scrollContainer.scrollTop = pageElement.offsetTop - 20;
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
      if (isScrollingProgrammatically.current) return;
      
      // 更新当前页码
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

      // 根据当前页码更新可见页面集合
      const newVisible = getVisiblePagesFromPage(currentPageNum, numPages, BUFFER_PAGES);
      const prev = visiblePagesRef.current;
      let changed = newVisible.size !== prev.size;
      if (!changed) {
        for (const page of newVisible) {
          if (!prev.has(page)) { changed = true; break; }
        }
      }
      if (changed) {
        visiblePagesRef.current = newVisible;
        setVisiblePagesKey(k => k + 1);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [numPages]);

  const onPageRenderSuccess = (pageNumber: number) => (page: { height: number; width: number }) => {
    // 存储实际渲染后的高度（用于占位符高度估算）
    const wrapperEl = pageRefs.current.get(pageNumber);
    if (wrapperEl) {
      pageHeightsRef.current.set(pageNumber, wrapperEl.getBoundingClientRect().height);
    } else {
      pageHeightsRef.current.set(pageNumber, page.height * scale);
    }
  };

  const onPageRenderError = (pageNumber: number) => (error: Error) => {
    console.error(`Page ${pageNumber} render error:`, error);
  };

  const allPages = useMemo(() => {
    return numPages > 0 ? Array.from({ length: numPages }, (_, i) => i + 1) : [];
  }, [numPages]);

  const shouldRenderPage = useCallback((pageNumber: number) => {
    return visiblePagesRef.current.has(pageNumber);
  }, []);

  // 返回已缩放的页面高度（用于占位符）
  const getPageHeight = useCallback((pageNumber: number) => {
    return pageHeightsRef.current.get(pageNumber) || (PAGE_HEIGHT_ESTIMATE * scale);
  }, [scale]);

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
      <Suspense fallback={<div>加载阅读器...</div>}>
        <EpubReaderView
          book={book}
          fileUrl={fileUrl}
          onBack={onBack}
        />
      </Suspense>
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
            {/* DEBUG: 可视页面检测指示器 */}
            <span className="visible-pages-debug" style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="当前渲染的页面（调试）">
              [{Array.from(visiblePagesRef.current).sort((a,b)=>a-b).join(',')}]
            </span>
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
            className={`toolbar-btn ${ocrText ? 'active' : ''}`} 
            onClick={() => {
              if (!ocrText) {
                setShowOCRModal(true);
              }
            }} 
            title={ocrText ? "OCR 文本已识别（在右侧面板查看）" : "OCR 文字识别"}
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

      <div className="reader-content" ref={readerContentRef}>
        <ResizablePanels
          panels={[
            { id: 'pdf', title: 'PDF 原文', icon: <FileText size={14} />, defaultWidth: 25, minWidth: 15, maxWidth: 50, collapsible: true },
            { id: 'qa', title: '问答', icon: <MessageCircle size={14} />, defaultWidth: 25, minWidth: 15, maxWidth: 45, collapsible: true },
            { id: 'graph', title: '知识图谱', icon: <Network size={14} />, defaultWidth: 25, minWidth: 15, maxWidth: 45, collapsible: true },
            { id: 'ocr', title: 'OCR 文本', icon: <ScanText size={14} />, defaultWidth: 25, minWidth: 15, maxWidth: 45, collapsible: true },
          ]}
          className="reader-four-panel"
        >
          <div className="panel-pdf-viewer" ref={pdfContainerRef}>
        {!fileUrl && (
          <div className="pdf-placeholder">
            <FileText size={80} strokeWidth={1} />
            <h3>未找到PDF文件</h3>
            <p>该书籍没有关联的PDF文件</p>
          </div>
        )}

        {fileUrl && (
          <div
            className="pdf-viewer-container four-panel-mode"
          >
            {isLoading && (
              <div className="reader-loading-overlay">
                <LoadingBook size={28} />
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
                const estimatedHeight = getPageHeight(pageNumber);
                const pageWidth = containerWidth;
                
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
                            <LoadingBook size={20} />
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
          </div>

          {/* 第2栏：Agent对话 */}
          <AgentChatPanel
            bookTitle={book.title}
            sourceDocId={book.id}
            ocrText={ocrText || undefined}
            currentChapterIndex={currentOcrChapter}
            pendingQuestion={pendingQuestion}
            onQuestionConsumed={() => setPendingQuestion(null)}
            onChainStateChange={(hasActive, isLoading) => {
              setHasActiveChain(hasActive);
              setIsChainLoading(isLoading);
            }}
            onChainUpdated={() => setGraphRefreshKey(k => k + 1)}
            externalMessage={externalMessage}
            onExternalMessageConsumed={() => setExternalMessage(null)}
            activeChainId={activeChainId}
            onActiveChainConsumed={() => setActiveChainId(null)}
          />

          {/* 第3栏：知识图谱 */}
          <KnowledgeGraphPanel
            bookTitle={book.title}
            bookId={book.id}
            refreshKey={graphRefreshKey}
            onNodeClick={handleKnowledgeNodeClick}
            onNodeChapterClick={setCurrentOcrChapter}
            onTextSelect={(text, action, chapterIndex, knowledgeNodeId) => {
              const prefix = action === 'refine' ? `细化概念：${text}` : `追问：${text}`;
              setExternalMessage({ role: 'user', content: prefix, chapterIndex, knowledgeNodeId: knowledgeNodeId ? String(knowledgeNodeId) : undefined });
            }}
          />

          {/* 第4栏：OCR 文本 */}
          <div className="panel-ocr-content">
        {ocrText && (
          <div className="ocr-text-panel" ref={ocrPanelRef}>
            {/* 标签页始终可见 */}
            <div className="ocr-text-header">
              <div className="ocr-mode-tabs">
                <button 
                  className={`ocr-mode-tab ${rightPanelMode === 'ocr' ? 'active' : ''}`}
                  onClick={() => setRightPanelMode('ocr')}
                >OCR</button>
                <button 
                  className={`ocr-mode-tab ${rightPanelMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setRightPanelMode('cards')}
                >笔记</button>
              </div>
              <div className="ocr-header-actions">
                {rightPanelMode === 'ocr' && !editMode && (
                  <>
                    <div className="ocr-font-size-control">
                      <button
                        className="font-size-btn"
                        onClick={() => setOcrFontSize(s => Math.max(10, s - 2))}
                        title="减小字号"
                      >A-</button>
                      <span className="font-size-value">{ocrFontSize}</span>
                      <button
                        className="font-size-btn"
                        onClick={() => setOcrFontSize(s => Math.min(36, s + 2))}
                        title="增大字号"
                      >A+</button>
                    </div>
                    <button 
                      className="auto-fix-btn"
                      onClick={() => handleGenerateNote()}
                      disabled={isGeneratingNote || (() => { const t = ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText; return t ? t.length > MAX_NOTE_CHARS : false; })()}
                      title={(() => { const t = ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText; const len = t ? t.length : 0; return len > MAX_NOTE_CHARS ? `文本过长（${len.toLocaleString()}字），请先分章节` : '将当前章节OCR文本整理为Markdown笔记'; })()}
                      style={(() => { const t = ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText; const len = t ? t.length : 0; const overLimit = len > MAX_NOTE_CHARS; return isGeneratingNote ? { opacity: 0.6, cursor: 'wait' } : overLimit ? { opacity: 0.4, cursor: 'not-allowed', background: 'var(--text-muted)', color: 'var(--text-secondary)', borderColor: 'transparent' } : { background: 'var(--accent-500)', color: 'white', borderColor: 'transparent' }; })()}
                    >
                      <Sparkles size={16} />
                      <span>{isGeneratingNote ? '整理中...' : (() => { const t = ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText; return t && t.length > MAX_NOTE_CHARS ? '过长' : '笔记'; })()}</span>
                    </button>
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
                  </>
                )}
                {rightPanelMode === 'ocr' && editMode && (
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
                      onClick={handleMergeNewlines}
                      title="将多个连续换行符合并为一个空行"
                    >
                      <span>¶ 合并换行</span>
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
              </div>
            </div>
            
            {/* 根据模式切换内容 */}
            {noteViewMode ? (
              <ChapterNoteViewer
                chapterTitle={ocrChapters.length > 0 ? `${book.title} - 第${currentOcrChapter + 1}章` : book.title}
                originalText={ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : (ocrText || '')}
                markdownContent={noteMarkdown}
                isGenerating={isGeneratingNote}
                onBack={() => setNoteViewMode(false)}
                bookId={book.id}
                noteId={chapterNoteId}
              />
            ) : rightPanelMode === 'cards' ? (
              <div className="ocr-card-content">
                <NoteCardPanel
                  chapters={ocrChapters.length > 0 ? ocrChapters : (ocrText ? [ocrText] : [])}
                  currentChapter={currentOcrChapter}
                  notes={chapterNotesMapRef.current}
                  onGenerateNote={(idx) => handleGenerateNote(idx)}
                  onBack={() => setRightPanelMode('ocr')}
                  hideHeader={true}
                />
              </div>
            ) : (
              <>
            {fixNotification && (
              <div className="fix-notification">
                {fixNotification}
              </div>
            )}
            {editMode && (
              <div className="auto-fix-hint edit-mode-hint">
                编辑模式 - 可自由修改文字内容（使用 Ctrl+F 搜索）
              </div>
            )}
            {editMode ? (
              <textarea
                ref={textareaRef}
                className="ocr-edit-textarea"
                value={editChapters.length > 0 ? editChapters[editCurrentChapter] : editText}
                onChange={handleEditTextChange}
                placeholder="在此编辑文字..."
                spellCheck={false}
                style={{ fontSize: ocrFontSize }}
              />
            ) : (
              <div 
                className="ocr-text-content"
                onMouseUp={handleOCRTextSelection}
                onContextMenu={handleOCRContextMenu}
              >
                <pre style={{ fontSize: ocrFontSize }}>{ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText}</pre>
              </div>
            )}
            {contextMenu?.show && (
              <div 
                className="ocr-context-menu"
                style={{
                  position: 'fixed',
                  left: contextMenu.x,
                  top: contextMenu.y,
                  zIndex: 1000,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  className="context-menu-item"
                  onClick={handleChapterize}
                  disabled={!contextMenu.selectedText}
                >
                  <span className="menu-icon">📑</span>
                  章节化
                </button>
                <button 
                  className="context-menu-item"
                  onClick={handleQuickFix}
                  disabled={!contextMenu.selectedText || contextMenu.selectedText.length < 2}
                >
                  <span className="menu-icon">🔧</span>
                  修复换行
                </button>
                <div className="context-menu-divider" />
                <button 
                  className="context-menu-item"
                  onClick={handleQuickSummary}
                  disabled={!contextMenu.selectedText || isChainLoading}
                  style={{ background: 'rgba(245, 158, 11, 0.1)' }}
                  title="总结选中内容，建立章节层级结构"
                >
                  <span className="menu-icon">📋</span>
                  {isChainLoading ? '处理中...' : '快速梳理'}
                </button>
                <div className="context-menu-divider" />
                <button 
                  className="context-menu-item"
                  onClick={handleAskQuestion}
                  disabled={!contextMenu.selectedText || isChainLoading}
                  title="创建新认知链，探索概念"
                >
                  <span className="menu-icon">💡</span>
                  {isChainLoading ? '处理中...' : '概念提问'}
                </button>
                <button 
                  className="context-menu-item"
                  onClick={handleFollowUpQuestion}
                  disabled={!contextMenu.selectedText || !hasActiveChain || isChainLoading}
                  title={!hasActiveChain ? '请先提问创建认知链' : '在当前认知链中深入追问'}
                >
                  <span className="menu-icon">🔗</span>
                  {isChainLoading ? '处理中...' : '深入追问'}
                </button>
              </div>
            )}
            {(editMode ? editChapters.length > 1 : showChapterNav) && (
              <div className="chapter-navigation">
                <button 
                  className="chapter-nav-btn"
                  onClick={() => {
                    if (editMode) {
                      handleEditChapterChange(Math.max(0, editCurrentChapter - 1));
                    } else {
                      handleChapterChange(Math.max(0, currentOcrChapter - 1));
                    }
                  }}
                  disabled={editMode ? editCurrentChapter === 0 : currentOcrChapter === 0}
                  title="上一章"
                >
                  ‹
                </button>
                <div className="chapter-pages">
                  {(editMode ? editChapters : ocrChapters).map((_, index) => (
                    <button
                      key={index}
                      className={`chapter-page-btn ${(editMode ? editCurrentChapter : currentOcrChapter) === index ? 'active' : ''}`}
                      onClick={() => {
                        if (editMode) {
                          handleEditChapterChange(index);
                        } else {
                          handleChapterChange(index);
                        }
                      }}
                      title={`第 ${index + 1} 章`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
                <button 
                  className="chapter-nav-btn"
                  onClick={() => {
                    if (editMode) {
                      const maxIdx = editChapters.length - 1;
                      handleEditChapterChange(Math.min(maxIdx, editCurrentChapter + 1));
                    } else {
                      handleChapterChange(Math.min(ocrChapters.length - 1, currentOcrChapter + 1));
                    }
                  }}
                  disabled={editMode ? editCurrentChapter === editChapters.length - 1 : currentOcrChapter === ocrChapters.length - 1}
                  title="下一章"
                >
                  ›
                </button>
              </div>
            )}
            </>
            )}
          </div>
        )}
          </div>
        </ResizablePanels>
      </div>

      {showPDFNotes && (
        <PDFNotesPanel
          documentId={book.id}
          bookId={book.id}
          bookTags={book.tags || undefined}
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
          bookId={book.id}
          onOCRComplete={handleOCRComplete}
        />
      )}
    </div>
  );
};

export default BookReaderView;
