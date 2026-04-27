import json
import os
import threading
from typing import Any, List, Optional

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.default_prompts import DEFAULT_PROMPTS_MAP

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(BASE_DIR, "user_settings.json")
API_CONFIGS_FILE = os.path.join(BASE_DIR, "api_configs.json")


# ============================================================
# API 配置管理器 (保持不变)
# ============================================================


class APIConfig(BaseModel):
    id: str
    name: str
    api_key: str
    api_base: str
    model_name: str
    is_active: bool = False


class APIConfigManager:
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
        self._configs: list[APIConfig] = []
        self._load_configs()

    def _load_configs(self):
        if os.path.exists(API_CONFIGS_FILE):
            try:
                with open(API_CONFIGS_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                    self._configs = [APIConfig(**cfg) for cfg in data.get("configs", [])]
                    print(f"[APIConfigManager] 加载了 {len(self._configs)} 个API配置")
            except Exception as e:
                print(f"[APIConfigManager] 加载配置失败: {e}")
                self._configs = []

    def _save_configs(self):
        try:
            data = {"configs": [cfg.model_dump() for cfg in self._configs]}
            with open(API_CONFIGS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[APIConfigManager] 保存配置失败: {e}")

    def get_all(self) -> list[APIConfig]:
        return self._configs

    def get_active(self) -> APIConfig | None:
        for cfg in self._configs:
            if cfg.is_active:
                return cfg
        return None

    def add(self, config: APIConfig) -> APIConfig:
        if len(self._configs) == 0:
            config.is_active = True
        self._configs.append(config)
        self._save_configs()
        return config

    def update(self, config_id: str, **kwargs) -> APIConfig | None:
        for i, cfg in enumerate(self._configs):
            if cfg.id == config_id:
                updated = cfg.model_copy(update=kwargs)
                self._configs[i] = updated
                self._save_configs()
                return updated
        return None

    def delete(self, config_id: str) -> bool:
        for i, cfg in enumerate(self._configs):
            if cfg.id == config_id:
                was_active = cfg.is_active
                del self._configs[i]
                if was_active and len(self._configs) > 0:
                    self._configs[0].is_active = True
                self._save_configs()
                return True
        return False

    def set_active(self, config_id: str) -> APIConfig | None:
        found = None
        for cfg in self._configs:
            if cfg.id == config_id:
                cfg.is_active = True
                found = cfg
            else:
                cfg.is_active = False
        if found:
            self._save_configs()
        return found


api_config_manager = APIConfigManager()


# ============================================================
# 设置项注册表 — 单一定义所有配置元数据
# ============================================================
# 每个条目: settings_key -> {file_key, default}
# - settings_key: Settings 类中的属性名
# - file_key: JSON 文件中对应的键名（None 表示与 settings_key 相同）
# - default: 默认值

SETTINGS_REGISTRY: dict[str, dict[str, Any]] = {
    # --- API / 基础配置 ---
    "openai_api_key": {"file_key": "api_key", "default": ""},
    "openai_api_base": {"file_key": "api_base", "default": "https://api.openai.com/v1"},
    "model_name": {"default": "gpt-4"},
    "database_url": {"default": "sqlite:///./interactive_docs.db"},
    "ai_backend_type": {"default": "api"},
    "opencode_cli_path": {"default": r"C:\Users\haokun\bin\opencode.exe"},
    # --- AI 提示词: 文档操作 ---
    "framework_prompt": {"required": True},
    "explain_prompt": {"required": True},
    "optimize_prompt": {"required": True},
    "timeline_prompt": {"required": True},
    # --- AI 提示词: 笔记 ---
    "quick_note_polish_prompt": {"required": True},
    "chapter_note_system_prompt": {"required": True},
    "chapter_note_prompt": {"required": True},
    # --- AI 提示词: 长文本改写 ---
    "long_text_rewrite_system_prompt": {"required": True},
    "long_text_rewrite_prompt": {"required": True},
    # --- AI 提示词: 笔记润色/生成 ---
    "polish_note_prompt": {"required": True},
    "polish_note_system_prompt": {"required": True},
    "generate_note_prompt": {"required": True},
    "generate_note_system_prompt": {"required": True},
    # --- AI 提示词: 章节结构 ---
    "structure_system_prompt": {"required": True},
    "structure_user_prompt": {"required": True},
    "section_fill_prompt": {"required": True},
    # --- AI 提示词: 知识图谱 & 认知链 ---
    "kg_concept_prompt": {"required": True},
    "kg_concept_user_prompt": {"required": True},
    "quick_summary_prompt": {"required": True},
    # --- 嵌入配置 ---
    "embedding_enabled": {"default": True},
    "embedding_model": {"default": "BAAI/bge-m3"},
    "embedding_device": {"default": "cuda:0"},
    "embedding_use_fp16": {"default": True},
    "embedding_dimension": {"default": 1024},
}

# 为 required=True 的字段填充默认值占位（实际默认值在 Settings 类中维护）
_SETTINGS_WITH_FILE_KEY: dict[str, str] = {}
for key, meta in SETTINGS_REGISTRY.items():
    file_key = meta.get("file_key", key)
    _SETTINGS_WITH_FILE_KEY[key] = file_key

# 所有需要序列化的 settings key（排除 database_url, embedding_use_fp16, embedding_dimension 等内部字段）
_SETTINGS_PERSISTED_KEYS = [
    k for k, v in SETTINGS_REGISTRY.items() if k not in ("database_url", "embedding_use_fp16", "embedding_dimension")
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        protected_namespaces=("settings_",),
    )
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4"
    database_url: str = "sqlite:///./interactive_docs.db"
    ai_backend_type: str = "api"
    opencode_cli_path: str = r"C:\Users\haokun\bin\opencode.exe"
    framework_prompt: str = ""
    explain_prompt: str = ""
    optimize_prompt: str = ""
    quick_note_polish_prompt: str = ""
    chapter_note_system_prompt: str = ""
    chapter_note_prompt: str = ""
    timeline_prompt: str = ""
    long_text_rewrite_system_prompt: str = ""
    long_text_rewrite_prompt: str = ""
    embedding_enabled: bool = True
    embedding_model: str = "BAAI/bge-m3"
    embedding_device: str = "cuda:0"
    embedding_use_fp16: bool = True
    embedding_dimension: int = 1024
    kg_concept_prompt: str = ""
    quick_summary_prompt: str = ""
    polish_note_prompt: str = ""
    polish_note_system_prompt: str = ""
    generate_note_prompt: str = ""
    generate_note_system_prompt: str = ""
    structure_system_prompt: str = ""
    structure_user_prompt: str = ""
    section_fill_prompt: str = ""
    kg_concept_user_prompt: str = ""


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
        self._fill_default_prompts()
        self._batch_upload_size = 5
        self._load_user_settings()

    def _fill_default_prompts(self):
        for key, default_value in DEFAULT_PROMPTS_MAP.items():
            current = getattr(self._settings, key, "")
            if not current:
                setattr(self._settings, key, default_value)

    @property
    def batch_upload_size(self) -> int:
        return self._batch_upload_size

    @batch_upload_size.setter
    def batch_upload_size(self, value: int):
        if isinstance(value, int) and 1 <= value <= 10:
            self._batch_upload_size = value

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_") or name in ("batch_upload_size",):
            raise AttributeError(name)
        if name in SETTINGS_REGISTRY:
            return getattr(self._settings, name)
        raise AttributeError(f"SettingsManager has no attribute '{name}'")

    def _load_user_settings(self):
        if not os.path.exists(SETTINGS_FILE):
            self._batch_upload_size = 5
            return
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                user_settings = json.load(f)
            for settings_key, file_key in _SETTINGS_WITH_FILE_KEY.items():
                if file_key in user_settings:
                    setattr(self._settings, settings_key, user_settings[file_key])
                # 向后兼容：也尝试用settings_key作为键名读取（旧文件可能用settings_key存储）
                elif settings_key in user_settings and settings_key != file_key:
                    setattr(self._settings, settings_key, user_settings[settings_key])
            if "batch_upload_size" in user_settings:
                self._batch_upload_size = user_settings["batch_upload_size"]
            else:
                self._batch_upload_size = 5
        except Exception as e:
            print(f"Failed to load user settings: {e}")
            self._batch_upload_size = 5

    def _save_user_settings(self):
        try:
            user_settings = {}
            for settings_key in _SETTINGS_PERSISTED_KEYS:
                file_key = _SETTINGS_WITH_FILE_KEY.get(settings_key, settings_key)
                user_settings[file_key] = getattr(self._settings, settings_key)
            user_settings["batch_upload_size"] = self._batch_upload_size
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(user_settings, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Failed to save user settings: {e}")

    def get_all(self) -> dict:
        result = {}
        for settings_key in _SETTINGS_PERSISTED_KEYS:
            file_key = _SETTINGS_WITH_FILE_KEY.get(settings_key, settings_key)
            result[file_key] = getattr(self._settings, settings_key)
        result["batch_upload_size"] = self._batch_upload_size
        return result

    def update(self, **kwargs):
        changed = False
        for settings_key, file_key in _SETTINGS_WITH_FILE_KEY.items():
            if file_key in kwargs:
                val = kwargs[file_key]
                if val is not None:
                    setattr(self._settings, settings_key, val)
                    changed = True
            elif settings_key in kwargs:
                val = kwargs[settings_key]
                if val is not None:
                    setattr(self._settings, settings_key, val)
                    changed = True
        if "batch_upload_size" in kwargs and kwargs["batch_upload_size"] is not None:
            val = kwargs["batch_upload_size"]
            if isinstance(val, int) and 1 <= val <= 10:
                self._batch_upload_size = val
                changed = True
        if changed:
            self._save_user_settings()


settings_manager = SettingsManager()
settings = settings_manager
