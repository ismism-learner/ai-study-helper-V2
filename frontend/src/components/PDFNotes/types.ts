import { Document } from '../../types';
import { QuickNote } from '../../api';

export interface PDFNote {
  id: string;
  title: string;
  content: string;
  page_number: number;
  created_at: string;
  tags: string[];
  event_date?: string;
  event_date_display?: string;
  event_date_end?: string;
  event_date_end_display?: string;
  is_time_range?: boolean;
  timeline_event_id?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface PDFNotesPanelProps {
  documentId: string;
  document?: Document;
  bookId?: string;
  bookTags?: string[];
  currentPage: number;
  onNoteClick?: (note: PDFNote) => void;
  onClose?: () => void;
}

export interface NewNoteState {
  title: string;
  content: string;
  page_number: number;
  tags: string[];
  event_date: string;
  event_date_display: string;
  event_date_end: string;
  event_date_end_display: string;
  is_time_range: boolean;
}

export interface DeleteConfirmState {
  isOpen: boolean;
  noteId: string;
  noteTitle: string;
}

export interface TimelineResults {
  raw_output: string;
  parsed_events: Array<{
    event_date: string;
    event_date_display: string;
    event_title: string;
    event_description: string;
  }>;
  total_events: number;
}

export type FilterMode = 'all' | 'current' | 'nearby';
export type ViewMode = 'page' | 'timeline';

export interface UsePDFNotesReturn {
  notes: PDFNote[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterMode: FilterMode;
  setFilterMode: (mode: FilterMode) => void;
  deleteConfirm: DeleteConfirmState;
  setDeleteConfirm: (state: DeleteConfirmState) => void;
  expandedSections: Set<string>;
  newNote: NewNoteState;
  setNewNote: React.Dispatch<React.SetStateAction<NewNoteState>>;
  showAddNoteForm: boolean;
  setShowAddNoteForm: (show: boolean) => void;
  editingNote: PDFNote | null;
  setEditingNote: React.Dispatch<React.SetStateAction<PDFNote | null>>;
  isGenerating: boolean;
  generateError: string | null;
  setGenerateError: React.Dispatch<React.SetStateAction<string | null>>;
  isQuickMode: boolean;
  setIsQuickMode: (mode: boolean) => void;
  quickContent: string;
  setQuickContent: (content: string) => void;
  isSavingQuick: boolean;
  quickNotes: QuickNote[];
  allUnprocessedQuickNotes: QuickNote[];
  selectedQuickNotes: Set<string>;
  setSelectedQuickNotes: React.Dispatch<React.SetStateAction<Set<string>>>;
  isBatchPolishing: boolean;
  polishResults: any[] | null;
  setPolishResults: React.Dispatch<React.SetStateAction<any[] | null>>;
  isGeneratingTimeline: boolean;
  timelineResults: TimelineResults | null;
  setTimelineResults: React.Dispatch<React.SetStateAction<TimelineResults | null>>;
  showTimelineResults: boolean;
  setShowTimelineResults: (show: boolean) => void;
  selectedTimelineEvents: Set<number>;
  setSelectedTimelineEvents: React.Dispatch<React.SetStateAction<Set<number>>>;
  showTimeInput: boolean;
  setShowTimeInput: (show: boolean) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  filteredNotes: PDFNote[];
  groupedNotes: Record<string, PDFNote[]>;
  loadNotes: () => Promise<void>;
  saveNotes: (notes: PDFNote[]) => void;
  handleDeleteClick: (note: PDFNote) => void;
  handleConfirmDelete: () => Promise<void>;
  handleNoteClick: (note: PDFNote) => void;
  toggleSection: (section: string) => void;
  handleAddNote: () => Promise<void>;
  handleEditNote: (note: PDFNote) => void;
  handleUpdateNote: () => Promise<void>;
  handleGenerateNote: () => Promise<void>;
  handleQuickSave: () => Promise<void>;
  handleNewQuickNote: () => void;
  handleSelectQuickNote: (noteId: string) => void;
  handleSelectAllQuickNotes: () => void;
  handleBatchPolish: () => Promise<void>;
  handleBatchTimelineGenerate: () => Promise<void>;
  handleSaveTimelineNotes: () => Promise<void>;
  parseTimeInput: (inputStr: string) => { event_date: string; display: string } | null;
}
