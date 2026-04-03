from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import threading
import os
import json


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(BASE_DIR, "user_settings.json")

DEFAULT_FRAMEWORK_PROMPT = """请分析以下文章内容，生成一个详细的结构化框架。

【原文内容】
{content}

【任务要求】
1. 分析文章的主要章节和段落结构
2. 从原文中提取所有专业术语、技术名词、核心概念（必须使用原文中的准确词汇）
3. 为每个章节总结核心要点
4. 列出文中出现的关键定义和概念

【输出格式要求】
- 使用Markdown格式
- 优先使用原文中的专业术语和特殊词语
- 术语和概念要尽可能完整、全面地罗列
- 分为"文章结构"和"核心术语"两部分

请严格按照上述要求生成框架："""

DEFAULT_EXPLAIN_PROMPT = """请解释以下术语或概念在给定文章上下文中的准确含义和定义。

【术语】
{keyword}

【原文上下文】
{context}

【任务要求】
1. 给出该术语在本文中的准确含义
2. 解释其在上下文中的作用和意义
3. 如有关联的概念或事件，请一并说明

请给出详细、准确的解释："""

DEFAULT_OPTIMIZE_PROMPT = """请优化以下段落，将其转换为书面化表达并删除重复性内容。

【原文段落】
{paragraph}

【优化要求】
1. 将口语化表达转换为书面化表达
2. 删除重复性表达，保持语义完整
3. 优化句子结构，提高可读性
4. 保持原文核心语义不变

【输出要求】
- 保持原文的核心意思和关键信息
- 使用更正式、规范的书面语言
- 删除冗余和重复的表达
- 确保语句通顺、逻辑清晰
- 只输出优化后的文本，不要添加任何解释或说明

请输出优化后的段落："""

DEFAULT_QUICK_NOTE_POLISH_PROMPT = """请对以下快速笔记进行润色和优化，为其生成合适的标题并优化内容表达。

【原始笔记内容】
{content}

【处理要求】
1. 生成一个简洁准确的标题（不超过15个字）
2. 优化内容表达，使其更加书面化和条理清晰
3. 保持原文核心意思不变
4. 如果内容涉及多个要点，可以适当分点表述

【输出格式】
请严格按照以下JSON格式输出，不要添加任何其他内容：
{
  "title": "生成的标题",
  "content": "优化后的内容",
  "tags": ["标签1", "标签2", "标签3"]
}

请输出处理结果："""


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4"
    database_url: str = "sqlite:///./interactive_docs.db"
    framework_prompt: str = DEFAULT_FRAMEWORK_PROMPT
    explain_prompt: str = DEFAULT_EXPLAIN_PROMPT
    optimize_prompt: str = DEFAULT_OPTIMIZE_PROMPT
    quick_note_polish_prompt: str = DEFAULT_QUICK_NOTE_POLISH_PROMPT

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


class SettingsManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._settings = Settings()
        self._load_user_settings()

    def _load_user_settings(self):
        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                    user_settings = json.load(f)
                    if 'framework_prompt' in user_settings:
                        self._settings.framework_prompt = user_settings['framework_prompt']
                    if 'explain_prompt' in user_settings:
                        self._settings.explain_prompt = user_settings['explain_prompt']
                    if 'optimize_prompt' in user_settings:
                        self._settings.optimize_prompt = user_settings['optimize_prompt']
                    if 'quick_note_polish_prompt' in user_settings:
                        self._settings.quick_note_polish_prompt = user_settings['quick_note_polish_prompt']
                    if 'api_base' in user_settings:
                        self._settings.openai_api_base = user_settings['api_base']
                    if 'model_name' in user_settings:
                        self._settings.model_name = user_settings['model_name']
                    if 'batch_upload_size' in user_settings:
                        self._batch_upload_size = user_settings['batch_upload_size']
                    else:
                        self._batch_upload_size = 5
            except Exception as e:
                print(f"Failed to load user settings: {e}")
                self._batch_upload_size = 5
        else:
            self._batch_upload_size = 5

    def _save_user_settings(self):
        try:
            user_settings = {
                'framework_prompt': self._settings.framework_prompt,
                'explain_prompt': self._settings.explain_prompt,
                'optimize_prompt': self._settings.optimize_prompt,
                'quick_note_polish_prompt': self._settings.quick_note_polish_prompt,
                'api_base': self._settings.openai_api_base,
                'model_name': self._settings.model_name,
                'batch_upload_size': self._batch_upload_size,
            }
            with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(user_settings, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Failed to save user settings: {e}")

    @property
    def openai_api_key(self) -> str:
        return self._settings.openai_api_key

    @property
    def openai_api_base(self) -> str:
        return self._settings.openai_api_base

    @property
    def model_name(self) -> str:
        return self._settings.model_name

    @property
    def database_url(self) -> str:
        return self._settings.database_url

    @property
    def framework_prompt(self) -> str:
        return self._settings.framework_prompt

    @property
    def explain_prompt(self) -> str:
        return self._settings.explain_prompt

    @property
    def optimize_prompt(self) -> str:
        return self._settings.optimize_prompt

    @property
    def quick_note_polish_prompt(self) -> str:
        return self._settings.quick_note_polish_prompt

    @property
    def batch_upload_size(self) -> int:
        return self._batch_upload_size

    def update(self, api_key: Optional[str] = None, api_base: Optional[str] = None, model_name: Optional[str] = None, framework_prompt: Optional[str] = None, explain_prompt: Optional[str] = None, optimize_prompt: Optional[str] = None, quick_note_polish_prompt: Optional[str] = None, batch_upload_size: Optional[int] = None):
        if api_key is not None:
            self._settings.openai_api_key = api_key
        if api_base is not None:
            self._settings.openai_api_base = api_base
        if model_name is not None:
            self._settings.model_name = model_name
        if framework_prompt is not None:
            self._settings.framework_prompt = framework_prompt
        if explain_prompt is not None:
            self._settings.explain_prompt = explain_prompt
        if optimize_prompt is not None:
            self._settings.optimize_prompt = optimize_prompt
        if quick_note_polish_prompt is not None:
            self._settings.quick_note_polish_prompt = quick_note_polish_prompt
        if batch_upload_size is not None:
            if 1 <= batch_upload_size <= 10:
                self._batch_upload_size = batch_upload_size
        self._save_user_settings()

    def get_all(self) -> dict:
        return {
            "api_key": self._settings.openai_api_key,
            "api_base": self._settings.openai_api_base,
            "model_name": self._settings.model_name,
            "framework_prompt": self._settings.framework_prompt,
            "explain_prompt": self._settings.explain_prompt,
            "optimize_prompt": self._settings.optimize_prompt,
            "quick_note_polish_prompt": self._settings.quick_note_polish_prompt,
            "batch_upload_size": self._batch_upload_size,
        }


settings_manager = SettingsManager()
settings = settings_manager
