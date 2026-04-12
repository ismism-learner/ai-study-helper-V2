# frontend/src/api/

API client layer — 17 modules for backend communication.

## WHERE TO LOOK

| Need | Module | Exports |
|------|--------|---------|
| Book CRUD, upload, cover, batch import, reading progress | `library.ts` | `countryApi`, `categoryApi`, `timePeriodApi`, `bookApi` |
| Document CRUD, framework generation, AI processing | `documents.ts` | `documentApi` |
| Timeline events (world + document) | `timeline.ts` | `worldTimelineApi` |
| Chapter note CRUD and AI generation | `chapterNotes.ts` | `chapterNoteApi` |
| Quick note CRUD, AI polish, groups | `quickNotes.ts` | `quickNoteApi` |
| Highlight CRUD and AI explanation | `highlights.ts` | `highlightApi` |
| Folder CRUD and hierarchy | `folders.ts` | `folderApi` |
| Task/todo CRUD | `tasks.ts` | `taskApi` |
| Activity logging and stats | `activity.ts` | `activityApi` |
| Backup/restore, integrity, scheduled backups | `backup.ts` | `backupApi` |
| Dashboard statistics and distributions | `dashboard.ts` | `dashboardApi` |
| OCR service (PaddleOCR + ocrmypdf) | `ocr.ts` | `pdfOcrApi` |
| Duplicate detection and resolution | `duplicate.ts` | `duplicateApi` |
| Document sources and Quark cloud drive | `external.ts` | `documentSourceApi`, `quarkApi` |
| Paragraph optimization, note polish/generate | `optimize.ts` | `optimizeApi` |
| Axios instances and base config | `client.ts` | `api`, `uploadApi`, `libraryApi`, `libraryUploadApi` |
| Re-exports all modules | `index.ts` | all of the above |

## CONVENTIONS

- **4 axios instances** in `client.ts`: `api` (base `/api`), `uploadApi` (base `/api`, for FormData), `libraryApi` (base `/api/library`), `libraryUploadApi` (base `/api/library`, for FormData). All modules import from `client.ts`.
- Each module exports an object literal with async methods (e.g. `bookApi.list()`, `taskApi.create()`), not individual functions.
- Return types are generic params on axios calls: `api.get<ResponseType>(...)`. No wrapper types.
- Types come from two sources: `../types.ts` (shared) and local interfaces in the module itself (e.g. `Task`, `QuickNote`, `ChapterNote`, `Activity` in their respective files).
- `index.ts` re-exports both API objects and local type interfaces. Components import from `api/index`, not individual modules.
- File uploads construct `FormData` manually, appending fields conditionally. Upload calls use `uploadApi` or `libraryUploadApi` (no explicit `Content-Type` header set; axios handles multipart automatically).
- SSE streaming uses raw `fetch()` + `ReadableStream`, not axios. Two modules do this: `documents.ts` (`generateFrameworkStream`) and `optimize.ts` (`optimizeParagraphStream`). Both parse `data: ` lines manually with `TextDecoder`.
- URL path params are interpolated with template literals: `` `/books/${id}` ``. Query params use axios `params` option.

## ANTI-PATTERNS

- DO NOT create new axios instances outside `client.ts`. The 4 existing ones cover all use cases.
- DO NOT hardcode `http://localhost:8000` or any backend URL. The `/api` prefix is proxied by Vite dev server.
- DO NOT add business logic to API modules. They are thin wrappers over HTTP calls.
- DO NOT import from individual `api/*.ts` files in components. Use `import { bookApi } from '../api'` (the index re-export).
- DO NOT define types in `types.ts` that already exist as local interfaces in an API module. Check both locations before adding.
- DO NOT use axios for SSE endpoints. Use `fetch()` with `text/event-stream` Accept header instead.
