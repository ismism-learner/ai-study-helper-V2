import asyncio
import logging
import os
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import SessionLocal, init_db
from app.routers.activity import router as activity_router
from app.routers.agent import router as agent_router
from app.routers.api_configs import router as api_configs_router
from app.routers.backup import router as backup_router
from app.routers.chapter_notes import router as chapter_notes_router
from app.routers.cognitive_chain import router as cognitive_chain_router
from app.routers.dashboard import router as dashboard_router
from app.routers.document_sources import router as document_sources_router
from app.routers.documents import router as documents_router
from app.routers.duplicates import router as duplicates_router
from app.routers.folders import router as folders_router
from app.routers.knowledge_graph import router as knowledge_graph_router
from app.routers.library import router as library_router
from app.routers.ocr import router as ocr_router
from app.routers.pdf_ocr import router as pdf_ocr_router
from app.routers.quark import router as quark_router
from app.routers.quick_notes import router as quick_notes_router
from app.routers.rewrite import router as rewrite_router
from app.routers.settings import router as settings_router
from app.routers.tasks import router as tasks_router
from app.routers.visualization_nodes import router as visualization_nodes_router
from app.routers.world_timeline import router as world_timeline_router
from app.services.backup_service import backup_service

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Interactive Document System",
    description="交互式文档增强系统API",
    version="1.0.0",
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3001,http://127.0.0.1:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_dir = "uploads/books"
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(documents_router, prefix="/api", tags=["documents"])
app.include_router(folders_router, prefix="/api", tags=["folders"])
app.include_router(settings_router, prefix="/api", tags=["settings"])
app.include_router(library_router, prefix="/api/library", tags=["library"])
app.include_router(ocr_router, prefix="/api/library/ocr", tags=["ocr"])
app.include_router(world_timeline_router, prefix="/api", tags=["world-timeline"])
app.include_router(quark_router, prefix="/api/quark", tags=["quark"])
app.include_router(duplicates_router, prefix="/api/duplicates", tags=["duplicates"])
app.include_router(pdf_ocr_router, prefix="/api/pdf-ocr", tags=["pdf-ocr"])
app.include_router(backup_router, prefix="/api/backup", tags=["backup"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(quick_notes_router, prefix="/api", tags=["quick-notes"])
app.include_router(chapter_notes_router, prefix="/api", tags=["chapter-notes"])
app.include_router(tasks_router, prefix="/api/tasks", tags=["tasks"])
app.include_router(activity_router, prefix="/api/activity", tags=["activity"])
app.include_router(visualization_nodes_router, prefix="/api", tags=["visualization-nodes"])
app.include_router(api_configs_router, prefix="/api", tags=["api-configs"])
app.include_router(rewrite_router, prefix="/api", tags=["rewrite"])
app.include_router(knowledge_graph_router, prefix="/api", tags=["knowledge-graph"])
app.include_router(agent_router, prefix="/api", tags=["agent"])
app.include_router(cognitive_chain_router, prefix="/api", tags=["cognitive-chains"])
app.include_router(document_sources_router, prefix="/api", tags=["document-sources"])


def preload_paddleocr():
    import time

    start_time = time.time()

    print(f"\n{'=' * 80}")
    print("[预加载] 开始预加载 PaddleOCR 模型...")
    print(f"[预加载] 开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'=' * 80}")

    try:
        from app.services.paddleocr_service import paddleocr_service

        print("[预加载] 调用 paddleocr_service.load_model_sync()...")
        success = paddleocr_service.load_model_sync()

        total_time = time.time() - start_time

        if success:
            print(f"\n{'=' * 80}")
            print("[预加载] ✅ PaddleOCR 模型预加载成功!")
            print(f"[预加载] 总耗时: {total_time:.2f} 秒")
            print(f"{'=' * 80}\n")
        else:
            print(f"\n{'=' * 80}")
            print("[预加载] ❌ PaddleOCR 模型预加载失败!")
            print(f"[预加载] 耗时: {total_time:.2f} 秒")
            print(f"[预加载] 错误: {paddleocr_service._load_error}")
            print(f"{'=' * 80}\n")

    except Exception as e:
        total_time = time.time() - start_time
        print(f"\n{'=' * 80}")
        print("[预加载] ❌ 预加载过程发生异常!")
        print(f"[预加载] 错误: {e}")
        print(f"[预加载] 耗时: {total_time:.2f} 秒")
        print(f"{'=' * 80}\n")
        import traceback

        traceback.print_exc()


@app.on_event("startup")
async def startup_event():
    init_db()

    print("=" * 50)
    print("Checking data integrity...")
    integrity = backup_service.check_data_integrity()

    if not integrity["healthy"]:
        print("WARNING: Data integrity issues detected!")
        for warning in integrity["warnings"]:
            print(f"  - {warning}")
        for rec in integrity["recommendations"]:
            print(f"  -> {rec}")
        print("Consider using /api/backup/emergency-recovery to restore data")
    else:
        print("Data integrity check passed")
        print(f"  Documents: {integrity['current_stats'].get('documents', 0)}")
        print(f"  Books: {integrity['current_stats'].get('book_documents', 0)}")
        print(f"  Timeline events: {integrity['current_stats'].get('document_timeline_events', 0)}")

    print("Creating startup backup...")
    backup_result = backup_service.create_backup("startup")
    if backup_result["success"]:
        print(f"Startup backup created: {backup_result['backup_path']}")
    else:
        print(f"Failed to create startup backup: {backup_result.get('error')}")

    backup_service.start_scheduled_backups(interval_hours=6)
    print("Scheduled backups enabled (every 6 hours)")
    print("=" * 50)

    preload_thread = threading.Thread(target=preload_paddleocr, daemon=True)
    preload_thread.start()


@app.get("/")
async def root():
    return {"message": "Interactive Document System API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
