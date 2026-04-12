from app.services.ai_service import ai_service
from app.config import settings_manager


async def generate_chapter_note(
    original_text: str, chapter_title: str = "未命名章节"
) -> str:
    """生成章节笔记，提示词从config读取"""
    system_prompt = settings_manager.chapter_note_system_prompt
    prompt_template = settings_manager.chapter_note_prompt

    prompt = prompt_template.format(
        chapter_title=chapter_title, original_text=original_text[:30000]
    )

    result = await ai_service.generate_text(prompt=prompt, system_prompt=system_prompt)

    return result


async def generate_chapter_note_stream(
    original_text: str, chapter_title: str = "未命名章节"
):
    """生成章节笔记（流式），提示词从config读取"""
    system_prompt = settings_manager.chapter_note_system_prompt
    prompt_template = settings_manager.chapter_note_prompt

    prompt = prompt_template.format(
        chapter_title=chapter_title, original_text=original_text[:30000]
    )

    async for chunk in ai_service.generate_text_stream(
        prompt=prompt, system_prompt=system_prompt
    ):
        yield chunk
