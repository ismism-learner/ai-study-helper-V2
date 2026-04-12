import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { optimizeApi, worldTimelineApi, quickNoteApi, QuickNote } from '../../api';
import {
  PDFNote,
  PDFNotesPanelProps,
  NewNoteState,
  DeleteConfirmState,
  FilterMode,
  ViewMode,
  TimelineResults,
  UsePDFNotesReturn,
} from './types';

const initialNewNote: NewNoteState = {
  title: '',
  content: '',
  page_number: 1,
  tags: [],
  event_date: '',
  event_date_display: '',
  event_date_end: '',
  event_date_end_display: '',
  is_time_range: false,
};

const initialDeleteConfirm: DeleteConfirmState = {
  isOpen: false,
  noteId: '',
  noteTitle: '',
};

export function usePDFNotes(
  documentId: string,
  document: PDFNotesPanelProps['document'],
  bookId: string | undefined,
  bookTags: string[] | undefined,
  currentPage: number,
  onNoteClick?: (note: PDFNote) => void
): UsePDFNotesReturn {
  const [notes, setNotes] = useState<PDFNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(initialDeleteConfirm);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['current', 'all']));
  const [newNote, setNewNote] = useState<NewNoteState>({ ...initialNewNote, page_number: currentPage });
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<PDFNote | null>(null);
  const [, setHistoryTags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [isQuickMode, setIsQuickMode] = useState(false);
  const [quickContent, setQuickContent] = useState('');
  const [isSavingQuick, setIsSavingQuick] = useState(false);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [allUnprocessedQuickNotes, setAllUnprocessedQuickNotes] = useState<QuickNote[]>([]);
  const [, setCurrentQuickNote] = useState<QuickNote | null>(null);
  const [selectedQuickNotes, setSelectedQuickNotes] = useState<Set<string>>(new Set());
  const [isBatchPolishing, setIsBatchPolishing] = useState(false);
  const [polishResults, setPolishResults] = useState<any[] | null>(null);
  const [isGeneratingTimeline, setIsGeneratingTimeline] = useState(false);
  const [timelineResults, setTimelineResults] = useState<TimelineResults | null>(null);
  const [showTimelineResults, setShowTimelineResults] = useState(false);
  const [selectedTimelineEvents, setSelectedTimelineEvents] = useState<Set<number>>(new Set());
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('page');

  const prevPageRef = useRef<number>(currentPage);

  const parseTimeInput = useCallback((inputStr: string): { event_date: string; display: string } | null => {
    if (!inputStr.trim()) return null;

    const str = inputStr.trim();
    let isBC = false;
    let yearStr = str;

    if (str.startsWith('-')) {
      isBC = true;
      yearStr = str.substring(1);
    } else if (str.includes('公元前')) {
      isBC = true;
      yearStr = str.replace('公元前', '').replace('年', '');
    }

    const parts = yearStr.split(/[-\/]/);
    const year = parseInt(parts[0]);
    if (isNaN(year)) return null;

    const actualYear = isBC ? -year : year;
    const prefix = isBC ? '公元前' : '';

    let eventDate = actualYear.toString().padStart(4, '0');
    if (actualYear < 0) {
      eventDate = actualYear.toString();
    }

    let display = `${prefix}${Math.abs(year)}年`;

    if (parts.length >= 2 && parts[1]) {
      const month = parseInt(parts[1]);
      if (!isNaN(month) && month >= 1 && month <= 12) {
        eventDate += `-${month.toString().padStart(2, '0')}`;
        display += `${month}月`;

        if (parts.length >= 3 && parts[2]) {
          const day = parseInt(parts[2]);
          if (!isNaN(day) && day >= 1 && day <= 31) {
            eventDate += `-${day.toString().padStart(2, '0')}`;
            display += `${day}日`;
          }
        }
      }
    }

    return { event_date: eventDate, display };
  }, []);

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const storedNotes = localStorage.getItem(`pdf_notes_${documentId}`);
      let localNotes: PDFNote[] = storedNotes ? JSON.parse(storedNotes) : [];

      if (bookId) {
        try {
          const eventsResponse = await worldTimelineApi.getBookTimelineEvents(bookId);
          const timelineEvents = eventsResponse.data || [];

          const timelineNotes: PDFNote[] = timelineEvents.map((event: any) => ({
            id: `timeline-${event.id}`,
            title: event.event_title,
            content: event.event_description || '',
            page_number: event.page_number,
            created_at: event.created_at || new Date().toISOString(),
            tags: event.tags || [],
            event_date: event.event_date,
            event_date_display: event.event_date_display,
            timeline_event_id: event.id,
          }));

          const localNoteIds = new Set(localNotes.map(n => n.id));
          const newTimelineNotes = timelineNotes.filter((tn: PDFNote) => !localNoteIds.has(tn.id));

          if (newTimelineNotes.length > 0) {
            localNotes = [...localNotes, ...newTimelineNotes];
            localStorage.setItem(`pdf_notes_${documentId}`, JSON.stringify(localNotes));
          }
        } catch (error) {
          console.error('Failed to load timeline events:', error);
        }
      }

      if (localNotes.length === 0) {
        const mockNotes: PDFNote[] = [
          {
            id: '1',
            title: '笔记示例 1',
            content: '这是一个测试笔记，展示了PDF笔记功能的基本用法。',
            page_number: 1,
            created_at: new Date().toISOString(),
            tags: ['重要', '总结'],
          },
          {
            id: '2',
            title: '笔记示例 2',
            content: '这是另一个测试笔记，可以在不同页面添加笔记。',
            page_number: 2,
            created_at: new Date().toISOString(),
            tags: ['思考'],
          },
          {
            id: '3',
            title: '笔记示例 3',
            content: '笔记会自动与当前浏览的页面同步。',
            page_number: 3,
            created_at: new Date().toISOString(),
            tags: ['提示'],
          },
        ];
        localNotes = mockNotes;
        localStorage.setItem(`pdf_notes_${documentId}`, JSON.stringify(mockNotes));
      }

      setNotes(localNotes);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, bookId]);

  const loadHistoryTags = useCallback(async () => {
    try {
      const response = await worldTimelineApi.getTimelineTagsHistory();
      setHistoryTags(response.data.tags || []);
    } catch (error) {
      console.error('Failed to load history tags:', error);
    }
  }, []);

  const loadQuickNotes = useCallback(async () => {
    try {
      const nearbyPages = [currentPage - 1, currentPage, currentPage + 1].filter(p => p > 0);
      const allNotesMap = new Map<string, QuickNote>();

      for (const page of nearbyPages) {
        try {
          const response = await quickNoteApi.list({
            source_document_id: documentId,
            is_processed: 0,
          });
          for (const note of response.data) {
            if (!allNotesMap.has(note.id)) {
              allNotesMap.set(note.id, note);
            }
          }
        } catch (error) {
          console.error(`Failed to load quick notes for page ${page}:`, error);
        }
      }

      const sortedNotes = Array.from(allNotesMap.values()).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setQuickNotes(sortedNotes);
      if (sortedNotes.length > 0) {
        setCurrentQuickNote(sortedNotes[0]);
      } else {
        setCurrentQuickNote(null);
      }
    } catch (error) {
      console.error('Failed to load quick notes:', error);
    }
  }, [documentId, currentPage]);

  const loadAllUnprocessedQuickNotes = useCallback(async () => {
    try {
      const response = await quickNoteApi.list({
        source_document_id: documentId,
        is_processed: 0,
      });
      setAllUnprocessedQuickNotes(response.data);
    } catch (error) {
      console.error('Failed to load all unprocessed quick notes:', error);
    }
  }, [documentId]);

  useEffect(() => {
    loadNotes();
  }, [documentId]);

  useEffect(() => {
    loadHistoryTags();
  }, []);

  useEffect(() => {
    if (isQuickMode) {
      loadQuickNotes();
      loadAllUnprocessedQuickNotes();
    }
  }, [currentPage, isQuickMode]);

  useEffect(() => {
    if (prevPageRef.current !== currentPage) {
      setNewNote(prev => ({ ...prev, page_number: currentPage }));
      if (editingNote) {
        setEditingNote(prev => prev ? { ...prev, page_number: currentPage } : null);
      }
      prevPageRef.current = currentPage;
    }
  }, [currentPage, editingNote]);

  const saveNotes = useCallback((updatedNotes: PDFNote[]) => {
    setNotes(updatedNotes);
    localStorage.setItem(`pdf_notes_${documentId}`, JSON.stringify(updatedNotes));
  }, [documentId]);

  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(note =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (filterMode === 'current') {
      filtered = filtered.filter(note => note.page_number === currentPage);
    } else if (filterMode === 'nearby') {
      filtered = filtered.filter(note =>
        Math.abs(note.page_number - currentPage) <= 2
      );
    }

    return filtered;
  }, [notes, searchQuery, filterMode, currentPage]);

  const groupedNotes = useMemo(() => {
    const groups: Record<string, PDFNote[]> = {
      current: filteredNotes.filter(note => note.page_number === currentPage),
      nearby: filteredNotes.filter(note =>
        note.page_number !== currentPage &&
        Math.abs(note.page_number - currentPage) <= 2
      ),
      other: filteredNotes.filter(note =>
        Math.abs(note.page_number - currentPage) > 2
      ),
    };

    return groups;
  }, [filteredNotes, currentPage]);

  const handleDeleteClick = useCallback((note: PDFNote) => {
    setDeleteConfirm({
      isOpen: true,
      noteId: note.id,
      noteTitle: note.title,
    });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    try {
      const noteToDelete = notes.find(note => note.id === deleteConfirm.noteId);

      if (noteToDelete?.timeline_event_id) {
        try {
          await worldTimelineApi.deleteTimelineEvent(noteToDelete.timeline_event_id);
        } catch (error) {
          console.error('Failed to delete timeline event:', error);
        }
      }

      if (noteToDelete?.event_date) {
        try {
          if (bookId) {
            const events = await worldTimelineApi.getBookTimelineEvents(bookId);
            const matchingEvent = events.data.find(e =>
              e.event_title === noteToDelete.title &&
              e.event_date === noteToDelete.event_date
            );
            if (matchingEvent) {
              await worldTimelineApi.deleteTimelineEvent(matchingEvent.id);
            }
          }
        } catch (error) {
          console.error('Failed to delete matching timeline event:', error);
        }
      }

      const updatedNotes = notes.filter(note => note.id !== deleteConfirm.noteId);
      saveNotes(updatedNotes);
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('删除笔记失败，请重试');
    } finally {
      setDeleteConfirm({ isOpen: false, noteId: '', noteTitle: '' });
    }
  }, [notes, deleteConfirm.noteId, bookId, saveNotes]);

  const handleNoteClick = useCallback((note: PDFNote) => {
    if (onNoteClick) {
      onNoteClick(note);
    }
  }, [onNoteClick]);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  }, []);

  const handleAddNote = useCallback(async () => {
    if (!newNote.title.trim()) {
      alert('请输入笔记标题');
      return;
    }

    try {
      const note: PDFNote = {
        id: Date.now().toString(),
        title: newNote.title,
        content: newNote.content,
        page_number: newNote.page_number,
        created_at: new Date().toISOString(),
        tags: newNote.tags,
        event_date: newNote.event_date || undefined,
        event_date_display: newNote.event_date_display || undefined,
        event_date_end: newNote.event_date_end || undefined,
        event_date_end_display: newNote.event_date_end_display || undefined,
        is_time_range: newNote.is_time_range || undefined,
      };

      if (newNote.event_date) {
        try {
          const displayText = newNote.event_date_display || newNote.event_date;
          const timelineData = {
            event_date: newNote.event_date,
            event_date_display: displayText,
            event_title: newNote.title,
            event_description: newNote.content || '',
            tags: newNote.tags.length > 0 ? newNote.tags : [],
          };

          if (bookId) {
            const requestData = {
              ...timelineData,
              page_number: newNote.page_number,
            };
            console.log('Creating timeline event (add) with bookId:', bookId, 'data:', requestData);
            const response = await worldTimelineApi.createTimelineEvent(bookId, requestData);
            note.timeline_event_id = response.data.id;
          } else if (document?.source_book_id) {
            const response = await worldTimelineApi.createTimelineEvent(document.source_book_id, {
              ...timelineData,
              page_number: newNote.page_number,
            });
            note.timeline_event_id = response.data.id;
          } else {
            const response = await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, timelineData);
            note.timeline_event_id = response.data.id;
          }
        } catch (error: any) {
          console.error('Failed to sync to timeline:', error);
          console.error('Error details:', error.response?.data || error.message);
        }
      }

      saveNotes([...notes, note]);
      setNewNote({
        title: '',
        content: '',
        page_number: currentPage,
        tags: [],
        event_date: '',
        event_date_display: '',
        event_date_end: '',
        event_date_end_display: '',
        is_time_range: false,
      });
      setShowAddNoteForm(false);
      setShowTimeInput(false);
    } catch (error) {
      console.error('Failed to add note:', error);
      alert('添加笔记失败，请重试');
    }
  }, [newNote, notes, bookId, document, documentId, currentPage, saveNotes]);

  const handleEditNote = useCallback((note: PDFNote) => {
    setEditingNote({ ...note });
    setShowAddNoteForm(true);
  }, []);

  const handleUpdateNote = useCallback(async () => {
    if (!editingNote || !editingNote.title.trim()) {
      alert('请输入笔记标题');
      return;
    }

    try {
      if (editingNote.event_date) {
        try {
          const displayText = editingNote.event_date_display || editingNote.event_date;
          const timelineData = {
            event_date: editingNote.event_date,
            event_date_display: displayText,
            event_title: editingNote.title,
            event_description: editingNote.content || '',
            tags: editingNote.tags.length > 0 ? editingNote.tags : [],
          };

          if (editingNote.timeline_event_id) {
            if (bookId || document?.source_book_id) {
              await worldTimelineApi.updateTimelineEvent(editingNote.timeline_event_id, {
                ...timelineData,
                page_number: editingNote.page_number,
              });
            } else {
              await worldTimelineApi.updateDocumentDirectTimelineEvent(editingNote.timeline_event_id, timelineData);
            }
          } else {
            if (bookId) {
              const requestData = {
                ...timelineData,
                page_number: editingNote.page_number,
              };
              console.log('Creating timeline event with bookId:', bookId, 'data:', requestData);
              const response = await worldTimelineApi.createTimelineEvent(bookId, requestData);
              editingNote.timeline_event_id = response.data.id;
            } else if (document?.source_book_id) {
              const response = await worldTimelineApi.createTimelineEvent(document.source_book_id, {
                ...timelineData,
                page_number: editingNote.page_number,
              });
              editingNote.timeline_event_id = response.data.id;
            } else {
              const response = await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, timelineData);
              editingNote.timeline_event_id = response.data.id;
            }
          }
        } catch (error: any) {
          console.error('Failed to sync to timeline:', error);
          console.error('Error details:', error.response?.data || error.message);
        }
      }

      const updatedNotes = notes.map(note =>
        note.id === editingNote.id ? editingNote : note
      );
      saveNotes(updatedNotes);
      setEditingNote(null);
      setShowAddNoteForm(false);
      setShowTimeInput(false);
    } catch (error) {
      console.error('Failed to update note:', error);
      alert('更新笔记失败，请重试');
    }
  }, [editingNote, notes, bookId, document, documentId, saveNotes]);

  const handleGenerateNote = useCallback(async () => {
    const content = editingNote ? editingNote.content : newNote.content;

    if (!content || !content.trim()) {
      setGenerateError('请先输入笔记内容');
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const response = await optimizeApi.generateNote(content);
      const { title, content: generatedContent } = response.data;

      if (editingNote) {
        setEditingNote({
          ...editingNote,
          title: title,
          content: generatedContent
        });
      } else {
        setNewNote({
          ...newNote,
          title: title,
          content: generatedContent
        });
      }
    } catch (error: any) {
      console.error('Failed to generate note:', error);
      setGenerateError(error.response?.data?.detail || '生成笔记失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  }, [editingNote, newNote]);

  const handleQuickSave = useCallback(async () => {
    if (!quickContent.trim()) return;

    setIsSavingQuick(true);
    try {
      await quickNoteApi.create({
        content: quickContent.trim(),
        source_document_id: documentId,
        source_page: currentPage,
        source_type: 'pdf',
      });

      setQuickContent('');
      loadQuickNotes();
    } catch (error) {
      console.error('Failed to save quick note:', error);
      alert('保存失败');
    } finally {
      setIsSavingQuick(false);
    }
  }, [quickContent, documentId, currentPage, loadQuickNotes]);

  const handleNewQuickNote = useCallback(() => {
    setCurrentQuickNote(null);
    setQuickContent('');
  }, []);

  const handleSelectQuickNote = useCallback((noteId: string) => {
    setSelectedQuickNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) {
        newSet.delete(noteId);
      } else {
        newSet.add(noteId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAllQuickNotes = useCallback(() => {
    if (selectedQuickNotes.size === allUnprocessedQuickNotes.length) {
      setSelectedQuickNotes(new Set());
    } else {
      setSelectedQuickNotes(new Set(allUnprocessedQuickNotes.map(n => n.id)));
    }
  }, [selectedQuickNotes.size, allUnprocessedQuickNotes]);

  const handleBatchPolish = useCallback(async () => {
    if (selectedQuickNotes.size === 0) {
      alert('请先选择要润色的笔记');
      return;
    }

    setIsBatchPolishing(true);
    try {
      const response = await quickNoteApi.batchProcess(
        Array.from(selectedQuickNotes),
        true
      );
      setPolishResults(response.data.results);
      loadQuickNotes();
      setSelectedQuickNotes(new Set());
    } catch (error) {
      console.error('Failed to batch polish:', error);
      alert('批量润色失败');
    } finally {
      setIsBatchPolishing(false);
    }
  }, [selectedQuickNotes, loadQuickNotes]);

  const handleBatchTimelineGenerate = useCallback(async () => {
    if (selectedQuickNotes.size === 0) {
      alert('请先选择要处理的笔记');
      return;
    }

    setIsGeneratingTimeline(true);
    let totalEvents = 0;
    let processedNotes = 0;
    const newNotesToAdd: PDFNote[] = [];

    try {
      const selectedNotesArray = allUnprocessedQuickNotes.filter(qn =>
        selectedQuickNotes.has(qn.id)
      );

      for (const qn of selectedNotesArray) {
        if (!qn.content.trim()) continue;

        try {
          const response = await worldTimelineApi.aiGenerateTimelineNotesFromContent(qn.content);

          if (response.data.parsed_events.length > 0) {
            for (const event of response.data.parsed_events) {
              const newNote: PDFNote = {
                id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                title: event.event_title,
                content: event.event_description,
                page_number: qn.source_page || currentPage,
                created_at: new Date().toISOString(),
                tags: bookTags || [],
                event_date: event.event_date,
                event_date_display: event.event_date_display,
              };

              newNotesToAdd.push(newNote);

              const timelineData = {
                event_date: event.event_date,
                event_date_display: event.event_date_display,
                page_number: qn.source_page || currentPage,
                event_title: event.event_title,
                event_description: event.event_description,
                importance: 'normal' as const,
                tags: bookTags || []
              };

              if (bookId) {
                await worldTimelineApi.createTimelineEvent(bookId, timelineData);
              } else {
                await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, timelineData);
              }

              totalEvents++;
            }

            await quickNoteApi.update(qn.id, { is_processed: 1 });
            processedNotes++;
          }
        } catch (error) {
          console.error(`Failed to process note ${qn.id}:`, error);
        }
      }

      if (newNotesToAdd.length > 0) {
        const updatedNotes = [...notes, ...newNotesToAdd];
        saveNotes(updatedNotes);
      }

      loadQuickNotes();
      loadAllUnprocessedQuickNotes();
      setSelectedQuickNotes(new Set());

      if (totalEvents > 0) {
        alert(`成功处理 ${processedNotes} 条笔记，生成 ${totalEvents} 条时间事件`);
      } else {
        alert('未识别到时间事件，请确保内容包含明确的时间信息');
      }
    } catch (error) {
      console.error('Failed to batch generate timeline notes:', error);
      alert('批量生成时间笔记失败');
    } finally {
      setIsGeneratingTimeline(false);
    }
  }, [selectedQuickNotes, allUnprocessedQuickNotes, currentPage, bookTags, bookId, documentId, notes, saveNotes, loadQuickNotes, loadAllUnprocessedQuickNotes]);

  const handleSaveTimelineNotes = useCallback(async () => {
    if (!timelineResults || selectedTimelineEvents.size === 0) {
      alert('请先选择要保存的事件');
      return;
    }

    try {
      const eventsToSave = Array.from(selectedTimelineEvents).map(i =>
        timelineResults.parsed_events[i]
      ).filter(Boolean);

      for (const event of eventsToSave) {
        const timelineData = {
          event_date: event.event_date,
          event_date_display: event.event_date_display,
          page_number: currentPage,
          event_title: event.event_title,
          event_description: event.event_description,
          importance: 'normal' as const,
          tags: bookTags || []
        };

        if (bookId) {
          await worldTimelineApi.createTimelineEvent(bookId, timelineData);
        } else {
          await worldTimelineApi.createDocumentDirectTimelineEvent(documentId, timelineData);
        }
      }

      alert(`成功保存 ${eventsToSave.length} 条时间事件到年表`);
      setShowTimelineResults(false);
      setTimelineResults(null);
      setSelectedTimelineEvents(new Set());
      setCurrentQuickNote(null);
      setQuickContent('');
      loadQuickNotes();
    } catch (error) {
      console.error('Failed to save timeline notes:', error);
      alert('保存时间事件失败');
    }
  }, [timelineResults, selectedTimelineEvents, currentPage, bookTags, bookId, documentId, loadQuickNotes]);

  return {
    notes,
    isLoading,
    searchQuery,
    setSearchQuery,
    filterMode,
    setFilterMode,
    deleteConfirm,
    setDeleteConfirm,
    expandedSections,
    newNote,
    setNewNote,
    showAddNoteForm,
    setShowAddNoteForm,
    editingNote,
    setEditingNote,
    isGenerating,
    generateError,
    setGenerateError,
    isQuickMode,
    setIsQuickMode,
    quickContent,
    setQuickContent,
    isSavingQuick,
    quickNotes,
    allUnprocessedQuickNotes,
    selectedQuickNotes,
    setSelectedQuickNotes,
    isBatchPolishing,
    polishResults,
    setPolishResults,
    isGeneratingTimeline,
    timelineResults,
    setTimelineResults,
    showTimelineResults,
    setShowTimelineResults,
    selectedTimelineEvents,
    setSelectedTimelineEvents,
    showTimeInput,
    setShowTimeInput,
    viewMode,
    setViewMode,
    filteredNotes,
    groupedNotes,
    loadNotes,
    saveNotes,
    handleDeleteClick,
    handleConfirmDelete,
    handleNoteClick,
    toggleSection,
    handleAddNote,
    handleEditNote,
    handleUpdateNote,
    handleGenerateNote,
    handleQuickSave,
    handleNewQuickNote,
    handleSelectQuickNote,
    handleSelectAllQuickNotes,
    handleBatchPolish,
    handleBatchTimelineGenerate,
    handleSaveTimelineNotes,
    parseTimeInput,
  };
}
