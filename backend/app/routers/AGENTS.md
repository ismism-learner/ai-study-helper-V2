# Routers — AI Study Helper V2

FastAPI router layer — 16 API route modules.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Book/PDF CRUD, upload, covers, batch import, reading progress | `library.py` | Largest router (2004 lines). Mixed CRUD + business logic |
| Document CRUD, framework generation, AI processing, highlights | `documents.py` | Second largest (1657 lines). Same mixed pattern |
| PDF OCR pipeline, chapter extraction, batch OCR | `pdf_ocr.py` | No DB dependency, delegates to `pdf_ocr_service` |
| OCR service endpoints (per-page, cached) | `ocr.py` | Hardcoded `uploads/ocr_cache` path |
| Quark cloud drive (browse, download, upload) | `quark.py` | Delegates to `quark_service`, `quark_config` |
| Duplicate detection and management | `duplicates.py` | Delegates to `duplicate_detector` |
| World timeline events for books | `world_timeline.py` | CRUD + cross-model queries (BookDocument, Document, ActivityLog) |
| Chapter note CRUD and AI generation | `chapter_notes.py` | Streaming responses for AI generation |
| Quick note CRUD and AI polish | `quick_notes.py` | Direct `ai_service` calls |
| App settings, AI prompt configuration | `settings.py` | No DB, uses `settings_manager` singleton |
| Folder CRUD and hierarchy | `folders.py` | Simplest router (76 lines) |
| Task/todo CRUD | `tasks.py` | Uses relative imports (`..database`, `..models`) |
| Activity logging | `activity.py` | Uses relative imports. Queries ActivityLog + BookDocument + WorldTimelineEvent |
| Backup/restore operations | `backup.py` | No DB, delegates to `backup_service` |
| Dashboard statistics | `dashboard.py` | Aggregation queries across multiple models |

## CONVENTIONS

- **Router definition**: `router = APIRouter()` (bare) or `router = APIRouter(tags=["xxx"])` in the file; prefix set in `main.py` via `app.include_router(xxx.router, prefix="/api/xxx", tags=["xxx"])`
- **Register new router**: import in `main.py`, add `app.include_router(your_router, prefix="/api/your-prefix", tags=["your-tag"])`
- **DB access**: `db: Session = Depends(get_db)` on every endpoint that needs it
- **Two import styles coexist**: `from app.database import get_db` (majority) vs `from ..database import get_db` (tasks.py, activity.py)
- **Pydantic models inline**: many routers define request/response models at the top of the file instead of using `schemas.py`
- **Error responses**: `raise HTTPException(status_code=xxx, detail="中文错误信息")`
- **AI calls**: through `services/ai_service.py` or domain-specific services (e.g. `chapter_note_service`), never direct OpenAI calls
- **Long operations**: use `BackgroundTasks` parameter for async work (pdf_ocr, quark, duplicates, backup)

## ANTI-PATTERNS

- DO NOT make direct OpenAI API calls in routers — use `ai_service.py` or domain services
- DO NOT add new DB models inline — add to `models.py`
- DO NOT put business logic in routers — delegate to `services/`
- DO NOT hardcode file paths — use `config.py` settings (ocr.py violates this with `uploads/ocr_cache`)
- DO NOT use synchronous file I/O in endpoints — use `BackgroundTasks` or `asyncio`
- DO NOT add router prefix in `APIRouter()` — set it in `main.py` `include_router` call
- DO NOT add new Pydantic models to routers — prefer `schemas.py` (existing inline models are legacy)
