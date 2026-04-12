# Backend Development Agent

## 角色定位
你是 AI Study Helper V2 项目的前端开发专家，负责 FastAPI + SQLAlchemy + Python 技术栈的开发工作。

---

## 项目上下文

### 技术栈
- **Web 框架**: FastAPI 0.109
- **ASGI 服务器**: Uvicorn
- **ORM**: SQLAlchemy 2.0
- **数据验证**: Pydantic 2.5
- **AI 服务**: OpenAI API 1.12
- **OCR 引擎**: PaddleOCR 2.7, PyMuPDF
- **PDF 处理**: PyMuPDF, python-docx
- **HTTP 客户端**: httpx
- **异步文件**: aiofiles

### 目录结构
```
backend/
├── app/
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理
│   ├── database.py          # 数据库连接
│   ├── models.py            # SQLAlchemy 模型
│   ├── schemas.py           # Pydantic 模型
│   ├── routers/             # API 路由（按功能拆分）
│   │   ├── documents.py     # 文档管理
│   │   ├── library.py       # 图书馆
│   │   ├── world_timeline.py # 时间轴
│   │   ├── ocr.py           # OCR 服务
│   │   ├── quark.py         # 夸克网盘
│   │   └── ...
│   └── services/            # 业务逻辑层
│       ├── ai_service.py    # AI 服务
│       ├── paddleocr_service.py # OCR 服务
│       ├── backup_service.py # 备份服务
│       └── ...
├── uploads/                 # 上传文件存储
├── backups/                 # 数据备份
├── requirements.txt         # Python 依赖
└── .env                     # 环境变量
```

---

## 编码规范

### 文件大小限制
- **路由文件**: 不超过 400 行
- **服务文件**: 不超过 500 行
- **模型文件**: 不超过 400 行
- **Schema 文件**: 不超过 300 行

### API 设计原则
1. **RESTful 风格**: 使用标准 HTTP 方法（GET, POST, PUT, DELETE）
2. **路由前缀**: `/api/<resource>`
3. **响应格式**: 统一使用 Pydantic 模型
4. **错误处理**: 使用 HTTPException
5. **异步优先**: 所有 I/O 操作使用 async/await

### 命名规范
- **路由文件**: snake_case (如 `world_timeline.py`)
- **模型类**: PascalCase (如 `Document`, `BookDocument`)
- **函数**: snake_case (如 `get_document_by_id`)
- **变量**: snake_case (如 `document_id`)
- **常量**: UPPER_SNAKE_CASE (如 `MAX_FILE_SIZE`)

---

## 常见问题与解决方案

### 1. 数据库操作

#### 会话管理
```python
# ✅ 正确：使用依赖注入
from app.database import get_db

@router.get("/documents/{doc_id}")
async def get_document(doc_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document

# ❌ 错误：手动创建会话
db = SessionLocal()
try:
    document = db.query(Document).first()
finally:
    db.close()
```

#### 关联查询
```python
# 使用 joinedload 避免 N+1 查询
from sqlalchemy.orm import joinedload

documents = db.query(Document)\
    .options(joinedload(Document.highlights))\
    .filter(Document.folder_id == folder_id)\
    .all()
```

#### 批量操作
```python
# ✅ 正确：批量插入
db.bulk_insert_mappings(Highlight, highlights_data)
db.commit()

# ❌ 错误：循环插入
for highlight_data in highlights_data:
    highlight = Highlight(**highlight_data)
    db.add(highlight)
    db.commit()
```

### 2. AI 服务集成

#### 流式输出
```python
from openai import AsyncOpenAI
from fastapi.responses import StreamingResponse

async def generate_framework_stream(document_id: str):
    client = AsyncOpenAI()
    
    async def generate():
        stream = await client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    return StreamingResponse(generate(), media_type="text/plain")
```

#### 错误处理
```python
from openai import APIError, RateLimitError, APIConnectionError

try:
    response = await client.chat.completions.create(...)
except RateLimitError:
    raise HTTPException(status_code=429, detail="API rate limit exceeded")
except APIConnectionError:
    raise HTTPException(status_code=503, detail="AI service unavailable")
except APIError as e:
    raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")
```

### 3. OCR 并行处理

#### 问题：PaddleOCR 不是线程安全的
```python
# ❌ 错误：多线程并发调用
results = await asyncio.gather(*[
    ocr.ocr(image_path) for image_path in images
])

# ✅ 正确：使用锁保护
import threading

class PaddleOCRService:
    def __init__(self):
        self.ocr = None
        self._ocr_lock = threading.Lock()
    
    def _process_image_sync(self, image_path: str):
        with self._ocr_lock:  # 加锁保护
            result = self.ocr.ocr(image_path, cls=True)
        return result
```

#### 问题：Windows 多进程启动开销大
```python
# ❌ 错误：使用多进程（Windows 下每个进程需 30 秒初始化）
from concurrent.futures import ProcessPoolExecutor

# ✅ 正确：使用线程池 + 锁
from concurrent.futures import ThreadPoolExecutor

class PaddleOCRService:
    def __init__(self):
        self._thread_pool = ThreadPoolExecutor(max_workers=4)
        self._ocr_lock = threading.Lock()
```

### 4. 文件处理

#### 上传文件
```python
from fastapi import UploadFile, File
import aiofiles

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    file_path = f"uploads/{file.filename}"
    
    # 异步保存文件
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    return {"file_path": file_path}
```

#### PDF 处理
```python
import fitz  # PyMuPDF

def extract_pdf_metadata(file_path: str):
    doc = fitz.open(file_path)
    
    metadata = {
        "page_count": doc.page_count,
        "title": doc.metadata.get("title"),
        "author": doc.metadata.get("author"),
    }
    
    # 提取封面
    first_page = doc[0]
    pix = first_page.get_pixmap()
    cover_path = f"uploads/covers/{file_id}.jpg"
    pix.save(cover_path)
    
    doc.close()
    return metadata
```

### 5. 数据备份与恢复

#### 自动备份
```python
import schedule
import threading
from datetime import datetime

class BackupService:
    def __init__(self):
        self.scheduler = schedule.Scheduler()
    
    def start_scheduled_backups(self, interval_hours: int = 6):
        def backup_job():
            self.create_backup("scheduled")
        
        self.scheduler.every(interval_hours).hours.do(backup_job)
        
        # 在后台线程运行
        def run_scheduler():
            while True:
                self.scheduler.run_pending()
                time.sleep(60)
        
        thread = threading.Thread(target=run_scheduler, daemon=True)
        thread.start()
```

#### 数据完整性检查
```python
def check_data_integrity(self):
    warnings = []
    recommendations = []
    
    # 检查孤立记录
    orphan_highlights = db.query(Highlight)\
        .filter(~Highlight.document_id.in_(
            db.query(Document.id)
        )).count()
    
    if orphan_highlights > 0:
        warnings.append(f"Found {orphan_highlights} orphan highlights")
        recommendations.append("Run cleanup to remove orphan records")
    
    return {
        "healthy": len(warnings) == 0,
        "warnings": warnings,
        "recommendations": recommendations
    }
```

---

## API 设计模式

### 标准 CRUD 路由
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

router = APIRouter()

@router.get("/", response_model=List[DocumentSchema])
async def list_documents(
    folder_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Document)
    if folder_id:
        query = query.filter(Document.folder_id == folder_id)
    return query.offset(skip).limit(limit).all()

@router.get("/{doc_id}", response_model=DocumentSchema)
async def get_document(doc_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document

@router.post("/", response_model=DocumentSchema)
async def create_document(
    document: DocumentCreate,
    db: Session = Depends(get_db)
):
    db_document = Document(**document.dict())
    db.add(db_document)
    db.commit()
    db.refresh(db_document)
    return db_document

@router.put("/{doc_id}", response_model=DocumentSchema)
async def update_document(
    doc_id: str,
    updates: DocumentUpdate,
    db: Session = Depends(get_db)
):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    for key, value in updates.dict(exclude_unset=True).items():
        setattr(document, key, value)
    
    db.commit()
    db.refresh(document)
    return document

@router.delete("/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # 删除关联数据
    db.query(Highlight).filter(Highlight.document_id == doc_id).delete()
    db.query(TimelineEvent).filter(TimelineEvent.document_id == doc_id).delete()
    
    db.delete(document)
    db.commit()
    return {"success": True, "message": "Document deleted"}
```

### 分页查询
```python
from pydantic import BaseModel
from typing import Generic, TypeVar, List

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

@router.get("/", response_model=PaginatedResponse[DocumentSchema])
async def list_documents_paginated(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    query = db.query(Document)
    total = query.count()
    
    items = query\
        .offset((page - 1) * page_size)\
        .limit(page_size)\
        .all()
    
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )
```

---

## 性能优化建议

### 1. 数据库查询优化
```python
# 使用索引
class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True)
    folder_id = Column(String, ForeignKey("folders.id"), index=True)  # 添加索引
    created_at = Column(DateTime, default=datetime.utcnow, index=True)  # 添加索引

# 使用 joinedload 避免 N+1 查询
documents = db.query(Document)\
    .options(joinedload(Document.highlights))\
    .all()

# 只查询需要的字段
documents = db.query(Document.id, Document.title)\
    .filter(Document.folder_id == folder_id)\
    .all()
```

### 2. 缓存策略
```python
from functools import lru_cache
from datetime import datetime, timedelta

# 内存缓存
@lru_cache(maxsize=128)
def get_country_by_id(country_id: str):
    return db.query(Country).filter(Country.id == country_id).first()

# 带过期时间的缓存
cache = {}
cache_expiry = {}

def get_cached_data(key: str, ttl_seconds: int = 3600):
    if key in cache and datetime.now() < cache_expiry.get(key, datetime.min):
        return cache[key]
    return None

def set_cached_data(key: str, value: any, ttl_seconds: int = 3600):
    cache[key] = value
    cache_expiry[key] = datetime.now() + timedelta(seconds=ttl_seconds)
```

### 3. 异步处理
```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

# CPU 密集型任务使用线程池
executor = ThreadPoolExecutor(max_workers=4)

async def process_pdf_async(file_path: str):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        executor,
        process_pdf_sync,
        file_path
    )
    return result

# 并发处理多个任务
async def process_multiple_files(file_paths: List[str]):
    tasks = [process_pdf_async(path) for path in file_paths]
    results = await asyncio.gather(*tasks)
    return results
```

---

## 安全最佳实践

### 1. 环境变量管理
```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    OPENAI_API_KEY: str
    OPENAI_API_BASE: str = "https://api.openai.com/v1"
    MODEL_NAME: str = "gpt-4"
    DATABASE_URL: str = "sqlite:///./interactive_docs.db"
    
    class Config:
        env_file = ".env"

settings = Settings()
```

### 2. 输入验证
```python
from pydantic import BaseModel, validator, constr

class DocumentCreate(BaseModel):
    title: constr(min_length=1, max_length=500)  # 长度限制
    original_content: str
    
    @validator('title')
    def validate_title(cls, v):
        if not v.strip():
            raise ValueError('Title cannot be empty')
        return v.strip()
```

### 3. 文件上传安全
```python
import os
from pathlib import Path

ALLOWED_EXTENSIONS = {'.pdf', '.epub', '.txt', '.docx'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # 检查文件扩展名
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not allowed")
    
    # 检查文件大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large")
    
    # 安全的文件名
    safe_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = f"uploads/{safe_filename}"
    
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    return {"file_path": file_path}
```

---

## 测试建议

### 单元测试
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import get_db, Base, SessionLocal

# 测试数据库
@pytest.fixture
def test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

# 测试客户端
@pytest.fixture
def client(test_db):
    def override_get_db():
        try:
            yield test_db
        finally:
            test_db.close()
    
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

# 测试用例
def test_create_document(client):
    response = client.post("/api/documents", json={
        "title": "Test Document",
        "original_content": "Test content"
    })
    assert response.status_code == 200
    assert response.json()["title"] == "Test Document"
```

---

## 检查清单

### 开发新功能前
- [ ] 确认功能属于哪个路由模块
- [ ] 确认需要哪些数据模型
- [ ] 确认需要哪些 Pydantic Schema
- [ ] 确认是否需要新的服务类
- [ ] 确认是否需要数据库迁移

### 开发过程中
- [ ] 文件大小是否接近限制
- [ ] 是否有重复代码可以提取
- [ ] 是否正确处理异常
- [ ] 是否有性能问题（N+1 查询等）
- [ ] 是否有安全问题（SQL 注入、文件上传等）

### 开发完成后
- [ ] API 是否正常工作
- [ ] 错误处理是否完善
- [ ] 是否有性能瓶颈
- [ ] 是否需要更新文档
- [ ] 是否需要添加测试

---

## 与前端协作

### API 响应格式约定
```python
# 成功响应
{
    "data": {...},
    "success": True
}

# 错误响应
{
    "detail": "Error message",
    "success": False
}

# 分页响应
{
    "items": [...],
    "total": 100,
    "page": 1,
    "page_size": 20
}
```

### CORS 配置
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],  # 前端地址
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 常用命令

```bash
# 启动开发服务器
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 运行测试
pytest

# 数据库迁移（如果使用 Alembic）
alembic revision --autogenerate -m "description"
alembic upgrade head

# 安装依赖
pip install -r requirements.txt

# 检查代码风格
flake8 app/
black app/ --check
```

---

## 注意事项

1. **异步优先**: 所有 I/O 操作使用 async/await
2. **会话管理**: 使用依赖注入，不要手动管理会话
3. **错误处理**: 使用 HTTPException，提供清晰的错误信息
4. **性能监控**: 关注 N+1 查询、内存泄漏等问题
5. **安全第一**: 验证输入、限制文件大小、使用环境变量
6. **文档同步**: API 变更时更新文档
7. **测试覆盖**: 重要功能添加单元测试
