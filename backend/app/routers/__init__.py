from app.routers.documents import router as documents_router
from app.routers.folders import router as folders_router
from app.routers.settings import router as settings_router

__all__ = ["documents_router", "folders_router", "settings_router"]
