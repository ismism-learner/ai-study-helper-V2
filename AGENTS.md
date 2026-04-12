# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-10
**Commit:** e78c83c
**Branch:** main

## OVERVIEW
AI Study Helper V2 — 智能文档管理与学习辅助系统. FastAPI + SQLAlchemy backend, React + TypeScript + Vite frontend. Chinese-language UI and prompts.

## STRUCTURE
```
.
├── backend/              # FastAPI backend (Python 3.11+)
│   ├── app/
│   │   ├── main.py       # Entry: uvicorn app.main:app
│   │   ├── config.py     # Pydantic Settings + SettingsManager singleton
│   │   ├── models.py     # 13 SQLAlchemy models (declarative_base)
│   │   ├── schemas.py    # Pydantic request/response schemas
│   │   ├── database.py   # Engine, SessionLocal, Base, init_db
│   │   ├── routers/      # 16 API route modules
│   │   └── services/     # 13 business logic services
│   ├── tests/            # Standalone test scripts (no pytest)
│   ├── uploads/          # User-uploaded files (gitignored)
│   ├── backups/          # Auto-backups (gitignored)
│   └── tools/            # kuake.exe binary (gitignored)
├── frontend/             # React + Vite frontend (Node 18+)
│   └── src/
│       ├── components/   # 51 React components (no routing library used)
│       ├── api/          # 17 API client modules
│       ├── hooks/        # 5 custom hooks
│       ├── styles/       # 15 CSS files
│       ├── types.ts      # Shared TypeScript interfaces
│       └── App.tsx       # Root component (manual view state, no router)
├── tessdata/             # Tesseract data (UNUSED — project uses PaddleOCR)
├── 一键启动.bat           # Start both services
└── 停止服务.bat           # Kill all python.exe/node.exe (dangerous)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint | `backend/app/routers/` | Register in `main.py` include_router |
| Add business logic | `backend/app/services/` | Import from router |
| Add DB model | `backend/app/models.py` | All 13 models in single file |
| Add Pydantic schema | `backend/app/schemas.py` | Request/response models |
| Add React component | `frontend/src/components/` | No naming convention enforced |
| Add API client call | `frontend/src/api/` | One module per domain, re-exported via index.ts |
| Add custom hook | `frontend/src/hooks/` | Export via index.ts |
| Add CSS styles | `frontend/src/styles/` | Component-specific CSS files |
| Configure AI prompts | `backend/app/config.py` | Runtime-overridable via user_settings.json |
| Configure env vars | `backend/.env` | See `.env.example` for template |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `app` | FastAPI | `backend/app/main.py` | Application entry, CORS, static files, startup |
| `Base` | DeclarativeBase | `backend/app/database.py` | SQLAlchemy base class (deprecated import) |
| `Settings` | Pydantic BaseSettings | `backend/app/config.py` | Config singleton with runtime overrides |
| `Folder` | Model | `backend/app/models.py` | Hierarchical document folders |
| `Document` | Model | `backend/app/models.py` | Text documents with highlights & timeline |
| `BookDocument` | Model | `backend/app/models.py` | PDF books with metadata, OCR, duplicates |
| `WorldTimelineEvent` | Model | `backend/app/models.py` | Book timeline events (world panel) |
| `DocumentTimelineEvent` | Model | `backend/app/models.py` | Document timeline events |
| `QuickNote` | Model | `backend/app/models.py` | Temporary notes with AI processing |
| `ChapterNote` | Model | `backend/app/models.py` | OCR→AI markdown chapter notes |
| `Highlight` | Model | `backend/app/models.py` | Text selections with AI explanations |
| `Task` | Model | `backend/app/models.py` | Todo/tracking items |
| `App` | React Component | `frontend/src/App.tsx` | Root: manual view state (mainView/libraryView) |
| `Sidebar` | React Component | `frontend/src/components/Sidebar.tsx` | Navigation sidebar |
| `PDFNotesPanel` | React Component | `frontend/src/components/PDFNotesPanel.tsx` | PDF annotation panel (1894 lines) |

## CONVENTIONS
- **Chinese-language project**: UI text, AI prompts, comments, test output all in Chinese
- **No routing library**: `App.tsx` uses `mainView`/`libraryView` state instead of react-router-dom (dependency exists but unused)
- **API proxy**: Vite proxies `/api` → `localhost:8000`; frontend calls `/api/...` paths
- **UUID strings**: All model PKs are UUID strings (`generate_uuid()`), not auto-increment
- **JSON columns**: Tags stored as JSON arrays in SQLite (`Column(JSON)`)
- **No Alembic**: Schema changes via `create_all()` only — no migration tooling
- **API client pattern**: `frontend/src/api/client.ts` exports 4 axios instances (`api`, `uploadApi`, `libraryApi`, `libraryUploadApi`)
- **Component style**: Each component has its own CSS file in `styles/`
- **Settings singleton**: `SettingsManager` with thread-safe init, runtime-overridable AI prompts

## ANTI-PATTERNS (THIS PROJECT)
- **DO NOT** use `react-router-dom` — project uses manual view state
- **DO NOT** add Alembic migrations — project uses `create_all()` (fragile but current pattern)
- **DO NOT** assume Tesseract OCR — project uses PaddleOCR exclusively; `tessdata/` is orphaned
- **DO NOT** use `datetime.utcnow` in new code — deprecated in Python 3.12+, use `datetime.now(UTC)`
- **DO NOT** use `@app.on_event("startup")` — deprecated, use `lifespan` context manager
- **DO NOT** use `declarative_base()` import — deprecated in SQLAlchemy 2.0, use `DeclarativeBase` class
- **DO NOT** trust CWD-relative DB paths — `config.py` defaults to `sqlite:///./interactive_docs.db`
- **DO NOT** add test files matching `test*.py` at root — `.gitignore` blocks them broadly

## CSS STYLING RULES (主题切换支持)

### 必须使用CSS变量

项目支持主题切换，**所有颜色必须使用CSS变量**，禁止硬编码颜色值。

**CSS变量定义位置：** `frontend/src/styles/base.css`

**常用变量：**
```css
/* 背景 */
--bg-base          /* 最底层背景 */
--bg-surface       /* 卡片/面板背景 */
--bg-elevated      /* 弹窗/悬浮层背景 */
--bg-hover         /* 悬停状态 */

/* 文字 */
--text-primary     /* 主要文字 */
--text-secondary   /* 次要文字 */
--text-muted       /* 弱化文字 */

/* 边框 */
--border-default   /* 默认边框 */
--border-subtle    /* 淡边框 */
--border-strong    /* 强边框 */

/* 主题色 */
--primary-500      /* 主色 */
--primary-600      /* 主色悬停 */
--accent-500       /* 强调色 */
--success-500      /* 成功色 */
--warning-500      /* 警告色 */
--danger-500       /* 危险色 */

/* 渐变 */
--gradient-primary   /* 主色渐变 */
--gradient-accent    /* 强调色渐变 */
--gradient-success   /* 成功色渐变 */
```

### 禁止的写法

```css
/* ❌ 错误 - 硬编码颜色 */
color: #3b82f6;
background: #1e293b;
border: 1px solid #334155;

/* ❌ 错误 - 内联样式中的硬编码 */
style={{ color: '#8b5cf6' }}
style={{ background: '#1a1a2e' }}
```

### 正确的写法

```css
/* ✅ 正确 - 使用CSS变量 */
color: var(--primary-500);
background: var(--bg-surface);
border: 1px solid var(--border-default);

/* ✅ 正确 - 使用CSS类 */
<span className="text-primary">
<div className="bg-surface">
```

### 组件内联样式处理

如果必须使用内联样式，使用CSS变量：

```tsx
// ✅ 正确
<div style={{ color: 'var(--text-primary)' }}>
<div style={{ background: 'var(--bg-surface)' }}>

// ❌ 错误
<div style={{ color: '#e2e8f0' }}>
<div style={{ background: '#1e293b' }}>
```

### 新增颜色变量

如果需要新颜色，在 `base.css` 的 `:root` 中定义：

```css
:root {
  /* 添加新的语义化变量 */
  --my-new-color: hsl(var(--hue-primary), 50%, 50%);
}
```

## AI PROMPT RULES (提示词配置规范)

### 所有AI提示词必须在设置面板可配置

项目支持用户自定义AI提示词，**所有新增AI功能必须遵循以下流程**：

**1. 后端配置 (`backend/app/config.py`)**
```python
# 添加默认提示词常量
DEFAULT_NEW_FEATURE_PROMPT = """提示词内容..."""

# 在 Settings 类中添加字段
class Settings(BaseSettings):
    new_feature_prompt: str = DEFAULT_NEW_FEATURE_PROMPT

# 在 SettingsManager 中添加：
# - _load_user_settings() 中加载
# - _save_user_settings() 中保存
# - @property 方法
# - update() 方法参数
# - get_all() 返回值
```

**2. 后端Schema (`backend/app/schemas.py`)**
```python
class SettingsResponse(BaseModel):
    new_feature_prompt: str = ""

class SettingsUpdate(BaseModel):
    new_feature_prompt: Optional[str] = None
```

**3. 后端路由 (`backend/app/routers/settings.py`)**
```python
# get_settings() 返回新字段
# update_settings() 传递新参数
```

**4. 前端接口 (`frontend/src/components/SettingsModal.tsx`)**
```typescript
// SettingsData 接口添加字段
interface SettingsData {
  new_feature_prompt: string;
}

// useState 初始值添加
// handleSave() 发送新字段
// UI中添加textarea输入框
```

**5. 服务中使用 (`backend/app/services/xxx_service.py`)**
```python
from app.config import settings_manager

# 从config读取，不要硬编码
prompt = settings_manager.new_feature_prompt
```

### 禁止硬编码提示词

```python
# ❌ 错误 - 硬编码提示词
prompt = "你是一个专业的XXX助手..."

# ✅ 正确 - 从config读取
prompt = settings_manager.new_feature_prompt
```

### 当前可配置的提示词

| 配置项 | 用途 | 适用对象 |
|--------|------|----------|
| `framework_prompt` | 框架生成 | 文档 |
| `explain_prompt` | 术语解释 | 文档 |
| `optimize_prompt` | 段落优化 | 文档 |
| `quick_note_polish_prompt` | 快速笔记润色 | 笔记 |
| `chapter_note_system_prompt` | 章节笔记系统提示 | 书籍 |
| `chapter_note_prompt` | 章节笔记用户提示 | 书籍 |
| `timeline_prompt` | 时间轴提取 | 文档 |

## UNIQUE STYLES
- Startup via `.bat` scripts (Windows-only deployment)
- `paddlepaddle-gpu` hardcoded in requirements.txt (no CPU fallback in pip)
- Console error suppression in `main.tsx` (masks `ERR_ABORTED` from PDF reader)
- `api.ts.bak` and `PDFNotesPanel_utf8.tsx` are stale artifacts in source tree
- `kuake.exe` binary in `backend/tools/` — compiled, no source, no docs
- Multiple scattered SQLite DB files (`app.db`, `study_helper.db`, `interactive_docs.db` at root + backend)

## COMMANDS
```bash
# Backend
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm run dev          # dev server on :3001
cd frontend && npm run build        # tsc + vite build

# Both services
.\一键启动.bat                       # Windows: starts both in separate windows
.\停止服务.bat                      # Windows: kills ALL python.exe/node.exe

# Tests (standalone scripts, no pytest)
cd backend && python tests/quick_verify.py
```

## NOTES
- **DB path is CWD-dependent**: `interactive_docs.db` appears at root, backend/, and frontend/ — only one is canonical
- **CORS is wildcard**: `allow_origins=["*"]` + `allow_credentials=True` is invalid per spec
- **No CI/CD**: Zero automation, no GitHub Actions, no pre-commit hooks
- **No linter/formatter**: No ESLint, Prettier, Ruff, Black, or mypy configured
- **No frontend tests**: Zero test coverage for React components
- **`.gitignore` overly broad**: `test*.py` pattern would ignore legitimate test files at root
- **TypeScript strict mode**: `strict: true`, `noUnusedLocals`, `noUnusedParameters` — enforced at build time
