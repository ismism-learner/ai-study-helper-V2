import uuid

from fastapi import APIRouter, HTTPException

from app.config import APIConfig, api_config_manager
from app.schemas import APIConfigCreate, APIConfigResponse, APIConfigUpdate

router = APIRouter()


@router.get("/api-configs", response_model=list[APIConfigResponse])
def get_api_configs():
    """获取所有API配置"""
    return api_config_manager.get_all()


@router.get("/api-configs/active", response_model=APIConfigResponse | None)
def get_active_api_config():
    """获取当前激活的API配置"""
    return api_config_manager.get_active()


@router.post("/api-configs", response_model=APIConfigResponse)
def create_api_config(config: APIConfigCreate):
    """创建新的API配置"""
    new_config = APIConfig(
        id=str(uuid.uuid4()),
        name=config.name,
        api_key=config.api_key,
        api_base=config.api_base,
        model_name=config.model_name,
        is_active=False,
    )
    return api_config_manager.add(new_config)


@router.put("/api-configs/{config_id}", response_model=APIConfigResponse)
def update_api_config(config_id: str, config: APIConfigUpdate):
    """更新API配置"""
    update_data = {k: v for k, v in config.model_dump().items() if v is not None}
    result = api_config_manager.update(config_id, **update_data)
    if not result:
        raise HTTPException(status_code=404, detail="配置不存在")
    return result


@router.delete("/api-configs/{config_id}")
def delete_api_config(config_id: str):
    """删除API配置"""
    if not api_config_manager.delete(config_id):
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"success": True}


@router.post("/api-configs/{config_id}/activate", response_model=APIConfigResponse)
def activate_api_config(config_id: str):
    """激活API配置"""
    result = api_config_manager.set_active(config_id)
    if not result:
        raise HTTPException(status_code=404, detail="配置不存在")
    return result
