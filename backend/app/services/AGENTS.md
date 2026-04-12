# Services — Business Logic Layer

Business logic services — 13 modules for AI, OCR, sync, and data processing

## WHERE TO LOOK

| Task | Module | Notes |
|------|--------|-------|
| OCR processing | `paddleocr_service.py`, `pdf_ocr_service.py`, `ocr_service.py` | PaddleOCR singleton, PDF pipeline, abstraction layer |
| AI/LLM calls | `ai_service.py` | All OpenAI interactions go here |
| Document sync | `document_sync_service.py` | Source synchronization |
| Backup/restore | `backup_service.py` | Auto-backup, integrity checks, emergency restore |
| Quark cloud drive | `quark_service.py` | Cookie auth, browse, download, upload |
| Duplicate detection | `duplicate_detector.py` | SHA256 exact, SimHash + MurmurHash fuzzy |
| Chapter notes | `chapter_note_service.py` | OCR text → AI markdown notes |
| Document processing | `document_processor.py` | Text processing, framework extraction |
| File parsing | `file_parser.py` | PDF, TXT, etc. content extraction |
| Code block detection | `code_block_detector.py` | Skip AI processing on code blocks |

## CONVENTIONS

- Services imported by routers directly, no dependency injection framework
- AI calls: always through `ai_service.py`, prompts configurable via `SettingsManager`
- OCR: PaddleOCR singleton via `paddleocr_service.py`, results cached in `uploads/ocr_cache/`
- Hash algorithms: SHA256 (exact match), SimHash + MurmurHash (fuzzy similarity) for duplicate detection
- Backup: auto-backup every 6 hours, integrity check on startup
- Quark: cookie-based auth, config stored in `quark_config/`

## ANTI-PATTERNS

- **DO NOT** call OpenAI API directly — use `ai_service.py`
- **DO NOT** instantiate PaddleOCR multiple times — use the singleton from `paddleocr_service.py`
- **DO NOT** hardcode AI prompts — use `SettingsManager` for runtime-overridable prompts
- **DO NOT** skip OCR cache — always check cache before re-processing
- **DO NOT** use Tesseract — project uses PaddleOCR exclusively
