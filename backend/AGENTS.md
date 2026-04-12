# Backend — AI Study Helper V2

FastAPI backend for AI Study Helper V2.

## STRUCTURE

| Path | What |
|------|------|
| `app/routers/` | 16 API route modules. `library.py` (1873 lines) is the largest |
| `app/services/` | 13 business logic services. `paddleocr_service.py` (1114 lines), `ai_service.py` (599 lines) |
| `tests/` | Standalone scripts, no pytest. `quick_verify.py` is CI-friendly |
| `uploads/` | User-uploaded files (gitignored). OCR cache lives in `uploads/ocr_cache/` |
| `backups/` | Auto-backups (gitignored) |
| `tools/` | `kuake.exe` binary (gitignored, no source) |
| `scripts/` | Maintenance scripts (e.g. `update_document_titles.py`) |
| `quark_config/` | Quark cloud drive config (gitignored) |

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint | `app/routers/` | Register in `main.py` via `include_router` |
| Add business logic | `app/services/` | Import from router, no DI framework |
| Add DB model | `app/models.py` | All 13 models in single file |
| Add Pydantic schema | `app/schemas.py` | Request/response models |
| Configure AI prompts | `app/config.py` | `SettingsManager` singleton, runtime-overridable via `user_settings.json` |
| Configure env vars | `.env` | See `.env.example` for template |
| Add test | `tests/` | Standalone scripts with `if __name__ == "__main__"` |

## CONVENTIONS

- **Router pattern**: each router = `APIRouter` with prefix, imported in `main.py`
- **Service pattern**: functions/classes imported by routers, no DI framework
- **DB sessions**: `get_db()` generator yields `SessionLocal`, routers use `Depends(get_db)`
- **Settings**: `SettingsManager.get_settings()` singleton, thread-safe init
- **Error handling**: `HTTPException` with Chinese error messages
- **OCR**: PaddleOCR via `paddleocr_service.py`, results cached in `uploads/ocr_cache/`
- **AI**: OpenAI API via `ai_service.py`, prompts configurable at runtime

## ANTI-PATTERNS

- DO NOT use pytest — tests are standalone scripts
- DO NOT add Alembic — project uses `create_all()`
- DO NOT use `datetime.utcnow` — use `datetime.now(UTC)`
- DO NOT use `@app.on_event("startup")` — use `lifespan`
- DO NOT use `declarative_base()` import — use `DeclarativeBase` class
- DO NOT hardcode file paths — use `config.py` settings
- DO NOT assume GPU — `paddlepaddle-gpu` is in requirements but startup bat has CPU fallback
