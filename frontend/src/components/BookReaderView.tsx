import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { BookDocument } from '../types';
import { bookApi, pdfOcrApi, chapterNoteApi } from '../api';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize2, Minimize2, FileText, Download, RefreshCw, BookOpen, ChevronLeft, ChevronRight, GripVertical, ScanText, X, Sparkles } from 'lucide-react';
import PDFNotesPanel from './PDFNotesPanel';

const EpubReaderView = lazy(() => import('./EpubReaderView'));
import PDFOCRModal from './PDFOCRModal';
import ChapterNoteViewer from './ChapterNoteViewer';
import NoteCardPanel from './NoteCardPanel';
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
const UNLOAD_BUFFER_PAGES = 5;
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
  const pageHeightsRef = useRef<Map<number, number>>(new Map());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>('');
  
  const [toolbarPosition, setToolbarPosition] = useState({ x: 20, y: 20 });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [showOCRPanel, setShowOCRPanel] = useState(false);
  const [fixNotification, setFixNotification] = useState<string | null>(null);
  const [showTagDetector, setShowTagDetector] = useState(false);
  const [detectedTags, setDetectedTags] = useState<{ text: string; count: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
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
  const [chapterNotesMap, setChapterNotesMap] = useState<Map<number, { chapterTitle: string; chapterIndex: number; markdownContent: string | null; isGenerating: boolean; noteId: string | null }>>(new Map());
  const [contextMenu, setContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ocrPanelRef = useRef<HTMLDivElement>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const readerContentRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const currentPageRef = useRef<number>(1);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const readingStartTimeRef = useRef<number>(Date.now());
  const lastSaveTimeRef = useRef<number>(Date.now());
  const accumulatedSecondsRef = useRef<number>(0);
  const isScrollingProgrammatically = useRef<boolean>(false);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const editChaptersRef = useRef<string[]>([]);
  const editCurrentChapterRef = useRef<number>(0);

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
    setVisiblePages(new Set());
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
      const container = showOCRPanel ? pdfScrollRef.current : readerContentRef.current;
      if (container) {
        setContainerWidth(container.clientWidth - 40);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [showOCRPanel]);

  useEffect(() => {
    const container = showOCRPanel ? pdfScrollRef.current : readerContentRef.current;
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
    
    const targetPage = initialPage || book.last_read_page || 1;
    
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
        const scrollContainer = showOCRPanel ? pdfScrollRef.current : readerContentRef.current;
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

  const parseChapters = useCallback((text: string): string[] => {
    const CHAPTER_MARKER = '====';
    const lines = text.split('\n');
    const chapters: string[] = [];
    let currentChapter: string[] = [];
    
    for (const line of lines) {
      if (line.trim().startsWith(CHAPTER_MARKER)) {
        // Always push current chapter content to preserve all ==== markers for lossless round-trip
        chapters.push(currentChapter.join('\n'));
        // Preserve raw content after ==== (including original spacing) for lossless round-trip
        currentChapter = [line.trim().substring(CHAPTER_MARKER.length)];
      } else {
        currentChapter.push(line);
      }
    }
    
    if (currentChapter.length > 0) {
      chapters.push(currentChapter.join('\n'));
    }
    
    // Filter out trailing empty chapter (from text ending with ====)
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
    return chapters.map(ch => ch.replace(/\n+$/, '')).join('\n');
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
    } catch (error) {
      console.error('Failed to save OCR text:', error);
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
    setShowTagDetector(false);
  }, [ocrText, currentOcrChapter, parseChapters, toEditChapters]);

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
    }, 2000);
  }, [reassembleFromEditChapters, parseChapters, toEditChapters, saveOCRText]);

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
    
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      selectedText: selectedText,
    });
  }, [ocrText]);

  const handleChapterize = useCallback(async () => {
    if (!contextMenu?.selectedText || !ocrText) return;
    
    const CHAPTER_MARKER = '====';
    const selectedText = contextMenu.selectedText;
    
    const lines = ocrText.split('\n');
    let found = false;
    let newChapterIndex = 0;
    let chapterCount = 0;
    
    const newLines = lines.map((line) => {
      if (line.trim().startsWith(CHAPTER_MARKER)) {
        chapterCount++;
      }
      if (!found && line.includes(selectedText.trim())) {
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
    } else {
      setFixNotification('未找到选中的文本');
    }
    
    setContextMenu(null);
    setTimeout(() => setFixNotification(null), 2000);
  }, [contextMenu, ocrText, saveOCRText]);

  const handleQuickFix = useCallback(async () => {
    if (!contextMenu?.selectedText || !ocrText) return;
    
    const selectedText = contextMenu.selectedText;
    
    if (selectedText.length < 2) {
      setFixNotification('请选择至少2个字符');
      setContextMenu(null);
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
    
    setContextMenu(null);
    setTimeout(() => setFixNotification(null), 2000);
  }, [contextMenu, ocrText, fixLineBreaksInText, saveOCRText]);

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

    setChapterNotesMap(prev => {
      const next = new Map(prev);
      next.set(chapterIdx, { chapterTitle, chapterIndex: chapterIdx, markdownContent: null, isGenerating: true, noteId: null });
      return next;
    });

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

      setChapterNotesMap(prev => {
        const next = new Map(prev);
        next.set(chapterIdx, { chapterTitle, chapterIndex: chapterIdx, markdownContent: mdContent, isGenerating: false, noteId });
        return next;
      });

      if (targetChapter === undefined) {
        setNoteMarkdown(mdContent);
      }

      await chapterNoteApi.update(noteId, {
        markdown_content: mdContent,
        status: 'completed',
      });
    } catch (error: any) {
      console.error('Failed to generate note:', error);
      setChapterNotesMap(prev => {
        const next = new Map(prev);
        next.set(chapterIdx, { chapterTitle, chapterIndex: chapterIdx, markdownContent: null, isGenerating: false, noteId: null });
        return next;
      });
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
      if (contextMenu?.show) {
        setContextMenu(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu?.show]);

  useEffect(() => {
    const loadExistingOCRText = async () => {
      if (!book.file_path) return;
      
      try {
        const response = await pdfOcrApi.hasOcrText(book.file_path);
        if (response.data.has_ocr_text) {
          const textResponse = await pdfOcrApi.getOcrText(book.file_path);
          const normalizedText = textResponse.data.replace(/\n{3,}/g, '\n\n');
          console.log('Loaded existing OCR text, length:', normalizedText.length);
          setOcrText(normalizedText);
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
    const scrollContainer = showOCRPanel ? pdfScrollRef.current : readerContentRef.current;
    if (pageElement && scrollContainer) {
      isScrollingProgrammatically.current = true;
      scrollContainer.scrollTop = pageElement.offsetTop - 20;
      setCurrentPage(pageNumber);
      currentPageRef.current = pageNumber;
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 100);
    }
  }, [numPages, showOCRPanel]);

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
    const scrollContainer = showOCRPanel ? pdfScrollRef.current : readerContentRef.current;
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
    const scrollContainer = showOCRPanel ? pdfScrollRef.current : readerContentRef.current;
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
              for (let i = Math.max(1, page - UNLOAD_BUFFER_PAGES); i <= Math.min(numPages, page + UNLOAD_BUFFER_PAGES); i++) {
                combined.add(i);
              }
            });
            prev.forEach(page => {
              const nearAnyVisible = Array.from(newVisiblePages).some(
                vp => Math.abs(page - vp) <= UNLOAD_BUFFER_PAGES
              );
              if (nearAnyVisible) {
                combined.add(page);
              }
            });
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
    pageHeightsRef.current.set(pageNumber, page.height);
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
    return pageHeightsRef.current.get(pageNumber) || PAGE_HEIGHT_ESTIMATE;
  }, []);

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

      <div className={`reader-content ${showOCRPanel ? 'with-ocr' : ''}`} ref={readerContentRef}>
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
                    <button 
                      className="auto-fix-btn"
                      onClick={() => handleGenerateNote()}
                      disabled={isGeneratingNote || (() => { const t = ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText; return t ? t.length > MAX_NOTE_CHARS : false; })()}
                      title={(() => { const t = ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText; const len = t ? t.length : 0; return len > MAX_NOTE_CHARS ? `文本过长（${len.toLocaleString()}字），请先分章节` : '将当前章节OCR文本整理为Markdown笔记'; })()}
                      style={(() => { const t = ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText; const len = t ? t.length : 0; const overLimit = len > MAX_NOTE_CHARS; return isGeneratingNote ? { opacity: 0.6, cursor: 'wait' } : overLimit ? { opacity: 0.4, cursor: 'not-allowed', background: 'linear-gradient(135deg, var(--text-muted), var(--bg-surface))', color: 'var(--text-secondary)', borderColor: 'transparent' } : { background: 'var(--gradient-accent)', color: 'white', borderColor: 'transparent' }; })()}
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
                    <button 
                      className="auto-fix-btn"
                      onClick={handleDetectTags}
                      title="检测并删除重复的章节标签"
                    >
                      <ScanText size={16} />
                      <span>标签</span>
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
                  notes={chapterNotesMap}
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
                value={editChapters.length > 0 ? editChapters[editCurrentChapter] : editText}
                onChange={handleEditTextChange}
                placeholder="在此编辑文字..."
                spellCheck={false}
              />
            ) : (
              <div 
                className="ocr-text-content"
                onMouseUp={handleOCRTextSelection}
                onContextMenu={handleOCRContextMenu}
              >
                <pre>{ocrChapters.length > 0 ? ocrChapters[currentOcrChapter] : ocrText}</pre>
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
