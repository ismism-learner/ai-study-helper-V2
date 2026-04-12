# frontend/src/components/

React component layer — 51 components for AI study helper UI

## STRUCTURE

```
components/
├── PDFNotes/              # PDF annotation sub-components
│   ├── index.tsx          # Main panel composition
│   ├── NoteEditor.tsx     # Inline note editing
│   ├── NotesList.tsx      # Note list with filtering
│   ├── QuickModePanel.tsx # Quick annotation mode
│   ├── types.ts           # Shared types for PDF notes
│   ├── usePanelDrag.ts    # Drag behavior hook
│   └── usePDFNotes.ts     # Core state/data hook for PDF notes
├── tagLibrary/            # Tag library sub-components
│   ├── index.ts           # Re-exports
│   ├── BookSelectionContextMenu.tsx  # Right-click book actions
│   ├── SelectionRectOverlay.tsx      # Visual selection overlay
│   ├── TagBookCard.tsx              # Book card in tag view
│   ├── TagLibraryHeader.tsx         # Tag library header/controls
│   └── tagLibraryStyles.ts          # Tag library CSS-in-JS styles
```

## WHERE TO LOOK

| Task | Files |
|------|-------|
| PDF reading/annotation | `PDFNotesPanel.tsx`, `BookReaderView.tsx`, `PDFNotes/`, `PDFOCRModal.tsx` |
| Book management | `BookManagementPanel.tsx`, `BookManageView.tsx`, `BookUploadModal.tsx`, `EditBookBody.tsx` |
| Timeline | `TimelineView.tsx`, `TimelinePanel.tsx`, `AITimelineNotesModal.tsx`, `WorldPanel.tsx`, `HierarchicalTimeline.tsx`, `TimelineVisualization.tsx`, `TimelineNotesView.tsx`, `TimelineNoteModal.tsx` |
| AI features | `FrameworkView.tsx`, `AITimelineNotesModal.tsx`, `BatchTimelineGeneratePanel.tsx`, `BatchRegeneratePanel.tsx` |
| Document editing | `DocumentEditor.tsx`, `DocumentManager.tsx`, `DocumentView.tsx`, `DocumentSourceManager.tsx` |
| Navigation | `Sidebar.tsx`, `LibraryView.tsx` |
| Upload flows | `BookUploadModal.tsx`, `BatchUploadModal.tsx`, `QuarkUploadModal.tsx` |
| Settings | `SettingsModal.tsx` |
| Tags | `TagLibraryView.tsx`, `tagLibrary/`, `QuickTagModal.tsx` |
| Notes | `QuickNotePanel.tsx`, `UnifiedNotesPanel.tsx`, `ChapterNoteViewer.tsx`, `NoteModal.tsx`, `AddNoteModal.tsx` |
| Duplicates | `DuplicateManager.tsx` |
| Dashboard | `DashboardPanel.tsx` |
| Geography | `CountryDetailView.tsx`, `ClassificationMatrix.tsx` |
| Folders | `FolderManager.tsx`, `FolderScanner.tsx` |
| Highlights | `HighlightPanel.tsx`, `PhilosophyKeywordsPanel.tsx` |
| Drag windows | `DraggableProgressWindow.tsx`, `DraggableTimelineWindow.tsx` |
| Batch operations | `BatchOptimizePanel.tsx`, `BatchRegeneratePanel.tsx`, `BatchTimelineGeneratePanel.tsx` |
| EPUB reading | `EpubReaderView.tsx` |
| Unarchived docs | `UnarchivedDocumentsPanel.tsx` |
| Time periods | `TimePeriodsManager.tsx` |
| Document creation | `CreateDocumentModal.tsx` |
| Confirmation | `ConfirmDialog.tsx` |

## CONVENTIONS

- No routing library — `App.tsx` uses `mainView`/`libraryView` state; `Sidebar.tsx` triggers view changes via callbacks
- Each component has matching CSS file in `styles/` directory (e.g., `PDFNotesPanel.tsx` → `styles/PDFNotesPanel.css`)
- API calls go through `api/` modules, never direct `fetch()`
- Large components (>1000 lines) are monolithic with tangled state — be cautious when modifying:
  - `PDFNotesPanel.tsx` (1894 lines), `BookReaderView.tsx` (1381 lines), `BookManagementPanel.tsx` (1278 lines), `BookManageView.tsx` (1225 lines), `TimelineView.tsx` (1189 lines), `FrameworkView.tsx` (1146 lines), `Sidebar.tsx` (1110 lines)
- Chinese text is inline in JSX, not i18n
- Modal pattern: `*Modal.tsx` components use state-controlled visibility (`isOpen`/`onClose` props)
- View pattern: `*View.tsx` components are top-level page-like components rendered by `App.tsx`
- Panel pattern: `*Panel.tsx` components are sub-sections embedded within views
- `PDFNotes/` sub-directory extracts logic from `PDFNotesPanel.tsx` — `usePDFNotes.ts` hook holds core state, `types.ts` defines shared interfaces
- `tagLibrary/` sub-directory uses CSS-in-JS (`tagLibraryStyles.ts`) instead of separate CSS file

## ANTI-PATTERNS

- **DO NOT** use `react-router-dom` — manual view state in `App.tsx`
- **DO NOT** add direct `fetch()` calls — use `api/` modules
- **DO NOT** create global CSS — use component-specific CSS files in `styles/`
- **DO NOT** split large components without understanding prop/state dependencies — monoliths have deeply coupled state
- **DO NOT** use Tesseract — OCR goes through backend API (`PDFOCRModal.tsx`)
- **DO NOT** add i18n — Chinese text stays inline in JSX
- **DO NOT** import from `PDFNotesPanel.tsx` internals — use `PDFNotes/` sub-components instead
