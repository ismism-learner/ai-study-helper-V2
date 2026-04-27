import httpx
from fastapi import APIRouter, HTTPException

from app.config import api_config_manager, settings_manager
from app.schemas import ModelsResponse, SettingsResponse, SettingsUpdate

router = APIRouter()


@router.get("/settings", response_model=SettingsResponse)
def get_settings():
    all_settings = settings_manager.get_all()
    masked_key = all_settings.get("api_key", "")
    if masked_key and len(masked_key) > 10:
        masked_key = masked_key[:4] + "..." + masked_key[-4:]
    elif masked_key:
        masked_key = masked_key[:2] + "..."

    # 如果API配置管理器有激活配置，优先展示
    active_config = api_config_manager.get_active()
    display_api_base = all_settings.get("api_base", "")
    display_model_name = all_settings.get("model_name", "")
    if active_config:
        masked_key = active_config.api_key
        if len(masked_key) > 10:
            masked_key = masked_key[:4] + "..." + masked_key[-4:]
        elif masked_key:
            masked_key = masked_key[:2] + "..."
        display_api_base = active_config.api_base
        display_model_name = active_config.model_name

    response = SettingsResponse(
        api_key=masked_key,
        api_base=display_api_base,
        model_name=display_model_name,
        ai_backend_type=all_settings.get("ai_backend_type", "api"),
        opencode_cli_path=all_settings.get("opencode_cli_path", "opencode"),
        framework_prompt=all_settings.get("framework_prompt", ""),
        explain_prompt=all_settings.get("explain_prompt", ""),
        optimize_prompt=all_settings.get("optimize_prompt", ""),
        quick_note_polish_prompt=all_settings.get("quick_note_polish_prompt", ""),
        chapter_note_system_prompt=all_settings.get("chapter_note_system_prompt", ""),
        chapter_note_prompt=all_settings.get("chapter_note_prompt", ""),
        timeline_prompt=all_settings.get("timeline_prompt", ""),
        long_text_rewrite_system_prompt=all_settings.get("long_text_rewrite_system_prompt", ""),
        long_text_rewrite_prompt=all_settings.get("long_text_rewrite_prompt", ""),
        batch_upload_size=all_settings.get("batch_upload_size", 5),
        embedding_enabled=all_settings.get("embedding_enabled", False),
        embedding_model=all_settings.get("embedding_model", ""),
        embedding_device=all_settings.get("embedding_device", ""),
        kg_concept_prompt=all_settings.get("kg_concept_prompt", ""),
        quick_summary_prompt=all_settings.get("quick_summary_prompt", ""),
        polish_note_prompt=all_settings.get("polish_note_prompt", ""),
        polish_note_system_prompt=all_settings.get("polish_note_system_prompt", ""),
        generate_note_prompt=all_settings.get("generate_note_prompt", ""),
        generate_note_system_prompt=all_settings.get("generate_note_system_prompt", ""),
        structure_system_prompt=all_settings.get("structure_system_prompt", ""),
        structure_user_prompt=all_settings.get("structure_user_prompt", ""),
        section_fill_prompt=all_settings.get("section_fill_prompt", ""),
        kg_concept_user_prompt=all_settings.get("kg_concept_user_prompt", ""),
    )
    return response


@router.get("/settings/models", response_model=ModelsResponse)
async def get_models():
    try:
        # 优先使用API配置管理器中的激活配置
        active_config = api_config_manager.get_active()
        if active_config:
            api_key = active_config.api_key
            base_url = active_config.api_base
        else:
            api_key = settings_manager.openai_api_key
            base_url = settings_manager.openai_api_base

        async with httpx.AsyncClient(timeout=10.0) as client:
            if not base_url.endswith("/"):
                base_url += "/"
            url = f"{base_url}models"
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if response.status_code == 200:
                data = response.json()
                if "data" in data:
                    models = sorted([m.get("id", m.get("name", "")) for m in data["data"]])
                    return ModelsResponse(models=models)
                elif isinstance(data, list):
                    models = sorted([m.get("id", m.get("name", "")) for m in data])
                    return ModelsResponse(models=models)
            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="API密钥无效")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"获取模型列表失败: {response.text}",
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="请求超时，请检查API地址是否正确")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取模型列表失败: {str(e)}")


@router.put("/settings", response_model=SettingsResponse)
def update_settings(settings_update: SettingsUpdate):
    update_data = settings_update.model_dump(exclude_none=True)
    settings_manager.update(**update_data)

    # 同步更新API配置管理器中的激活配置
    active_config = api_config_manager.get_active()
    if active_config:
        sync_data = {}
        if "api_base" in update_data and update_data["api_base"]:
            sync_data["api_base"] = update_data["api_base"]
        if "model_name" in update_data and update_data["model_name"]:
            sync_data["model_name"] = update_data["model_name"]
        if "api_key" in update_data and update_data["api_key"]:
            sync_data["api_key"] = update_data["api_key"]
        if sync_data:
            api_config_manager.update(active_config.id, **sync_data)

    return get_settings()
