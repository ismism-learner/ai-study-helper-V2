from fastapi import APIRouter, HTTPException
from app.config import settings_manager
from app.schemas import SettingsResponse, ModelsResponse, SettingsUpdate
import httpx

router = APIRouter()


@router.get("/settings", response_model=SettingsResponse)
def get_settings():
    all_settings = settings_manager.get_all()
    masked_key = all_settings["api_key"]
    if masked_key and len(masked_key) > 10:
        masked_key = masked_key[:4] + "..." + masked_key[-4:]
    elif masked_key:
        masked_key = masked_key[:2] + "..."
    return SettingsResponse(
        api_key=masked_key,
        api_base=all_settings["api_base"],
        model_name=all_settings["model_name"],
        ai_backend_type=all_settings.get("ai_backend_type", "api"),
        opencode_cli_path=all_settings.get("opencode_cli_path", "opencode"),
        framework_prompt=all_settings["framework_prompt"],
        explain_prompt=all_settings["explain_prompt"],
        optimize_prompt=all_settings["optimize_prompt"],
        quick_note_polish_prompt=all_settings.get("quick_note_polish_prompt", ""),
        chapter_note_system_prompt=all_settings.get("chapter_note_system_prompt", ""),
        chapter_note_prompt=all_settings.get("chapter_note_prompt", ""),
        timeline_prompt=all_settings.get("timeline_prompt", ""),
        long_text_rewrite_system_prompt=all_settings.get(
            "long_text_rewrite_system_prompt", ""
        ),
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


@router.get("/settings/models", response_model=ModelsResponse)
async def get_models():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            base_url = settings_manager.openai_api_base
            if not base_url.endswith("/"):
                base_url += "/"
            url = f"{base_url}models"

            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {settings_manager.openai_api_key}"},
            )

            if response.status_code == 200:
                data = response.json()
                if "data" in data:
                    models = [m.get("id", m.get("name", "")) for m in data["data"]]
                    return ModelsResponse(models=models)
                elif isinstance(data, list):
                    models = [m.get("id", m.get("name", "")) for m in data]
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
    settings_manager.update(
        api_key=settings_update.api_key,
        api_base=settings_update.api_base,
        model_name=settings_update.model_name,
        ai_backend_type=settings_update.ai_backend_type,
        opencode_cli_path=settings_update.opencode_cli_path,
        framework_prompt=settings_update.framework_prompt,
        explain_prompt=settings_update.explain_prompt,
        optimize_prompt=settings_update.optimize_prompt,
        quick_note_polish_prompt=settings_update.quick_note_polish_prompt,
        chapter_note_system_prompt=settings_update.chapter_note_system_prompt,
        chapter_note_prompt=settings_update.chapter_note_prompt,
        timeline_prompt=settings_update.timeline_prompt,
        long_text_rewrite_system_prompt=settings_update.long_text_rewrite_system_prompt,
        long_text_rewrite_prompt=settings_update.long_text_rewrite_prompt,
        batch_upload_size=settings_update.batch_upload_size,
        embedding_enabled=settings_update.embedding_enabled,
        embedding_model=settings_update.embedding_model,
        embedding_device=settings_update.embedding_device,
        kg_concept_prompt=settings_update.kg_concept_prompt,
        quick_summary_prompt=settings_update.quick_summary_prompt,
        polish_note_prompt=settings_update.polish_note_prompt,
        polish_note_system_prompt=settings_update.polish_note_system_prompt,
        generate_note_prompt=settings_update.generate_note_prompt,
        generate_note_system_prompt=settings_update.generate_note_system_prompt,
        structure_system_prompt=settings_update.structure_system_prompt,
        structure_user_prompt=settings_update.structure_user_prompt,
        section_fill_prompt=settings_update.section_fill_prompt,
        kg_concept_user_prompt=settings_update.kg_concept_user_prompt,
    )

    return get_settings()
