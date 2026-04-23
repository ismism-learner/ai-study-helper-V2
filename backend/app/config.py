from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
from pydantic import BaseModel
import threading
import os
import json


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(BASE_DIR, "user_settings.json")
API_CONFIGS_FILE = os.path.join(BASE_DIR, "api_configs.json")


class APIConfig(BaseModel):
    """API配置项"""

    id: str
    name: str
    api_key: str
    api_base: str
    model_name: str
    is_active: bool = False


class APIConfigManager:
    """API配置管理器"""

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
        self._configs: List[APIConfig] = []
        self._load_configs()

    def _load_configs(self):
        """加载API配置"""
        if os.path.exists(API_CONFIGS_FILE):
            try:
                with open(API_CONFIGS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._configs = [
                        APIConfig(**cfg) for cfg in data.get("configs", [])
                    ]
                    print(f"[APIConfigManager] 加载了 {len(self._configs)} 个API配置")
            except Exception as e:
                print(f"[APIConfigManager] 加载配置失败: {e}")
                self._configs = []

    def _save_configs(self):
        """保存API配置"""
        try:
            data = {"configs": [cfg.model_dump() for cfg in self._configs]}
            with open(API_CONFIGS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[APIConfigManager] 保存配置失败: {e}")

    def get_all(self) -> List[APIConfig]:
        """获取所有配置"""
        return self._configs

    def get_active(self) -> Optional[APIConfig]:
        """获取当前激活的配置"""
        for cfg in self._configs:
            if cfg.is_active:
                return cfg
        return None

    def add(self, config: APIConfig) -> APIConfig:
        """添加新配置"""
        # 如果是第一个配置，自动激活
        if len(self._configs) == 0:
            config.is_active = True
        self._configs.append(config)
        self._save_configs()
        return config

    def update(self, config_id: str, **kwargs) -> Optional[APIConfig]:
        """更新配置"""
        for i, cfg in enumerate(self._configs):
            if cfg.id == config_id:
                updated = cfg.model_copy(update=kwargs)
                self._configs[i] = updated
                self._save_configs()
                return updated
        return None

    def delete(self, config_id: str) -> bool:
        """删除配置"""
        for i, cfg in enumerate(self._configs):
            if cfg.id == config_id:
                was_active = cfg.is_active
                del self._configs[i]
                # 如果删除的是激活的配置，激活第一个
                if was_active and len(self._configs) > 0:
                    self._configs[0].is_active = True
                self._save_configs()
                return True
        return False

    def set_active(self, config_id: str) -> Optional[APIConfig]:
        """设置激活的配置"""
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


# 全局API配置管理器
api_config_manager = APIConfigManager()

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

DEFAULT_CHAPTER_NOTE_SYSTEM_PROMPT = """你是一个专业的学习笔记整理助手。你的任务是将OCR识别的原始文本整理成结构清晰、通俗易懂的Markdown格式笔记。

【核心理念：讲人话】
你的首要目标是让内容"好懂"。想象你在给一个聪明的非专业人士讲解：
- 用日常语言替代专业黑话
- 用类比和例子解释抽象概念
- 复杂的内容拆解成小步骤
- 读者看完能说"原来如此"，而不是"这说的是啥"

【基本要求】
1. 使用Markdown格式，包含标题、列表、加粗、代码块等
2. **将晦涩的表述转换为朴实易懂的语言**（这是最重要的！）
3. 保留所有重要内容，不要遗漏关键信息
4. 添加适当的章节结构和层次
5. 对专业术语给出简短、通俗的解释
6. 输出纯Markdown，不要用```markdown包裹
7. **禁止使用任何emoji表情符号**，只使用纯文本和Markdown格式

【代码块识别与修复 - 重要！】
OCR识别的代码经常出现破损、缺失、格式错乱。你需要：

1. **识别代码片段**：根据上下文判断是否为代码（如变量定义、函数、循环、类定义等）

2. **修复破损代码**：
   - 补全缺失的括号、引号、缩进
   - 修复OCR识别错误的字符（如 l→1, O→0, →→> 等）
   - 根据上下文推断缺失的关键字或变量名
   - 保持代码逻辑完整性

3. **用代码块包裹**：
   - Python代码：```python
   - JavaScript代码：```javascript
   - 通用代码：```code
   - Shell命令：```bash

【数学公式处理】
1. 行内公式：$公式$
2. 独立公式：$$公式$$ 或 ```latex 包裹
3. 确保LaTeX语法正确，修复OCR识别错误

【图表描述处理】
如果文本描述了图表、数据可视化，用 ```chart 包裹：
```chart
type: 图表类型（line/bar/pie/scatter）
description: 图表描述
data: 数据说明
```

【示例】
OCR原文（破损）：
"def c1cu1ate_pv(fv, r, n
    retun fv / (1 + r) ** n"

整理后（修复）：
```python
def calculate_pv(fv, r, n):
    # 计算现值
    return fv / (1 + r) ** n
```

【注意事项】
- 只有真正可以公式化/代码化/图表化的内容才使用代码块
- 纯文字描述保持普通文本格式
- 不要过度使用代码块，普通段落用普通文本"""

DEFAULT_CHAPTER_NOTE_PROMPT = """请将以下OCR识别的原始文本整理成结构清晰、通俗易懂的Markdown格式笔记。

章节标题：{chapter_title}

原始文本：
{original_text}

【重要提醒】
- 禁止使用任何emoji表情符号
- 只使用纯文本和Markdown格式
- 直接输出整理后的Markdown内容，不要添加任何解释说明"""

DEFAULT_TIMELINE_PROMPT = """请仔细阅读以下文档内容，提取其中明确提到的历史事件或时间节点。

要求：
1. 识别文档中所有明确提到的时间点（年、月、日、时期、朝代等）
2. 为每个时间点提取对应的事件描述和重要性估计
3. 按时间顺序排列事件

输出格式规范：
- 事件记录格式：{[时间1/事件描述/重要性], [时间2/事件描述/重要性], [时间3/事件描述/重要性]}
- 时间格式说明：
  - 只有年：[1995/事件描述/重要性]
  - 有年月：[1995-03/事件描述/重要性]
  - 完整日期：[1995-03-15/事件描述/重要性]
- 重要性：1-5的数字，5最重要

注意事项：
1. 只提取文档中明确提到的时间，不要推测
2. 如果只提到年没有月日，就只写年
3. 事件描述要简洁，不超过50字

请按照上述格式输出提取的时间事件："""

# 长文本改写提示词
DEFAULT_LONG_TEXT_REWRITE_SYSTEM_PROMPT = """你是一个专业的文本改写助手。你的任务是将原文改写成通俗易懂、口语化的版本。

【核心原则】
1. **保持完整**：绝对不能精简、删减内容，要保持原有的信息量
2. **降低门槛**：用日常语言替代专业术语，让非专业人士也能看懂
3. **保持结构**：保留原有的章节结构、表格、代码示例
4. **口语化表达**：用"你"而不是"读者"，用比喻和例子解释抽象概念

【改写风格】
- 把"具有动态语义的解释型面向对象高级编程语言"改成"像英语一样易读，像积木一样灵活"
- 把"该变量保存的是最后一次的赋值结果"改成"新的赋值会覆盖旧的"
- 用表格整理对比信息
- 用代码块展示示例
- 用加粗标记重点

【禁止事项】
- 禁止精简内容
- 禁止删除表格、代码示例
- 禁止使用emoji
- 禁止改变原有结构"""

DEFAULT_LONG_TEXT_REWRITE_PROMPT = """请根据原文内容，填充并改写以下小节。

【原文内容】
{original_content}

【待填充的小节】
{section_identifier}

【改写要求】
1. 保持原文的所有信息，不要精简
2. 用通俗易懂的语言改写
3. 保留所有表格、代码示例
4. 保持原有的章节编号和标题

请输出完整改写后的小节内容："""


DEFAULT_KG_EXTRACTION_PROMPT = """你是一个专业的哲学文本分析助手。你的任务是从给定的哲学文本中提取知识图谱实体。

请仔细分析以下文本片段，识别并提取以下类型的实体：

1. **Philosopher（哲学家）**: 文本中提到的哲学家姓名
   - 包括生卒年份、国籍、所属学派等信息
   
2. **Concept（概念）**: 重要的哲学概念、术语
   - 包括定义、类别（形而上学、认识论、伦理学等）、关键特征
   
3. **Theory（理论）**: 哲学理论或学说
   - 包括核心主张、适用范围、局限性
   
4. **Work（著作）**: 提及的哲学著作
   - 包括作者、出版年份、主要主题
   
5. **Argument（论证）**: 重要的论证结构
   - 包括前提、结论、论证类型
   
6. **School（学派）**: 哲学流派或学派
   - 包括时代、关键人物、核心教义
   
7. **Era（时代）**: 历史时期或时代背景
   - 包括起止年份、时代特征

请按以下 JSON 格式返回提取结果：

```json
{
  "philosophers": [
    {
      "name": "哲学家姓名",
      "description": "简要描述",
      "birth_year": 出生年份,
      "death_year": 逝世年份,
      "nationality": "国籍",
      "schools": ["所属学派"],
      "source_text": "原文引用",
      "source_location": "位置信息（如页码）",
      "confidence": 0.95
    }
  ],
  "concepts": [
    {
      "name": "概念名称",
      "description": "概念描述",
      "category": "概念类别",
      "definition": "定义",
      "key_characteristics": ["特征1", "特征2"],
      "examples": ["示例1"],
      "source_text": "原文引用",
      "source_location": "位置信息",
      "confidence": 0.9
    }
  ],
  "theories": [],
  "works": [],
  "arguments": [],
  "schools": [],
  "eras": []
}
```

注意：
- 只提取文本中明确提及的实体
- 为每个实体提供原文引用作为证据
- confidence 表示你对此提取的置信度（0-1之间）
- 如果某类实体在文本中不存在，返回空数组
- 确保 JSON 格式正确，可以被解析

待分析文本：
{text}"""

DEFAULT_KG_RELATION_PROMPT = """你是一个专业的哲学文本分析助手。你的任务是从给定的哲学文本中提取实体之间的关系。

基于以下已识别的实体列表，请分析文本并提取它们之间的关系：

已识别实体：
{entities}

请识别以下类型的关系：

**哲学家相关关系：**
- BORN_IN: 出生于某地
- DIED_IN: 逝世于某地
- BELONGS_TO: 属于某学派
- INFLUENCED_BY: 受到谁的影响
- INFLUENCED: 影响了谁

**著作相关关系：**
- AUTHORED: 撰写了某著作
- AUTHORED_BY: 由谁撰写
- PUBLISHED_IN: 出版于某年

**概念相关关系：**
- PROPOSED: 提出了某概念
- PROPOSED_BY: 由谁提出
- RELATED_TO: 与某概念相关
- CONTRADICTS: 与某概念矛盾
- SUBSUMES: 包含/涵盖某概念
- INSTANCE_OF: 是某概念的实例

**理论相关关系：**
- BASED_ON: 基于某理论
- DERIVED_FROM: 派生自某理论
- CRITIQUES: 批判某理论
- SUPPORTS: 支持某理论

**论证相关关系：**
- CONTAINS: 包含某论证
- PREMISE_OF: 是某论证的前提
- CONCLUSION_OF: 是某论证的结论
- ASSUMES: 假设了某概念
- IMPLIES: 蕴含了某概念

请按以下 JSON 格式返回关系列表：

```json
{
  "relations": [
    {
      "source": "源实体名称",
      "target": "目标实体名称",
      "relation_type": "关系类型",
      "description": "关系描述",
      "strength": 0.9,
      "evidence": "支持此关系的原文引用",
      "confidence": 0.85
    }
  ]
}
```

注意：
- 只提取文本中明确表达的关系
- 为每个关系提供原文引用作为证据
- strength 表示关系强度（0-1之间）
- confidence 表示你对此提取的置信度（0-1之间）
- 确保 source 和 target 对应已识别实体列表中的名称
- 确保 JSON 格式正确，可以被解析

待分析文本：
{text}"""

DEFAULT_KG_CONCEPT_PROMPT = """你是一个白痴天才，请将下文尽可能详细说人话的方式与我复述。

输出格式要求（必须严格遵循，只输出JSON，不要有其他内容）：
```json
{
  "label": "概念简称（2-8个字）",
  "definition": "用说人话的方式详细解释这个概念（100-200字）",
  "domain": "所属领域",
  "key_concepts": ["相关概念1", "相关概念2"],
  "suggested_questions": ["追问建议1", "追问建议2"]
}
```

重要规则：
1. label 必须是简短精炼的概念名称，不是文本片段
2. definition 必须用说人话的方式详细解释，不要用专业术语堆砌
3. 只输出JSON，不要有任何其他文字"""

DEFAULT_QUICK_SUMMARY_PROMPT = """请快速梳理以下文本的核心内容和逻辑结构。

输出格式要求（必须严格遵循，只输出JSON，不要有其他内容）：
```json
{
  "label": "章节/段落标题（简短概括，2-10个字）",
  "definition": "核心内容概述（50-100字，说人话的方式）",
  "key_concepts": ["核心概念1", "核心概念2", "核心概念3"],
  "structure": ["要点1", "要点2", "要点3"]
}
```

重要规则：
1. label 要简短精炼，能概括这段文本的主题
2. definition 用说人话的方式概述核心内容
3. key_concepts 提取3-5个核心概念
4. structure 列出主要逻辑要点
5. 只输出JSON，不要有任何其他文字"""
DEFAULT_KG_EXPAND_PROMPT = (
    "请解释以下概念及其与相关概念之间的关系，并提供进一步的认知扩展："
)
DEFAULT_KG_CHAT_PROMPT = (
    "你是一个哲学和概念分析助手。请基于以下知识库内容和对话历史，回答用户的问题："
)


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4"
    database_url: str = "sqlite:///./interactive_docs.db"
    ai_backend_type: str = "api"
    opencode_cli_path: str = r"C:\Users\haokun\bin\opencode.exe"
    framework_prompt: str = DEFAULT_FRAMEWORK_PROMPT
    explain_prompt: str = DEFAULT_EXPLAIN_PROMPT
    optimize_prompt: str = DEFAULT_OPTIMIZE_PROMPT
    quick_note_polish_prompt: str = DEFAULT_QUICK_NOTE_POLISH_PROMPT
    chapter_note_system_prompt: str = DEFAULT_CHAPTER_NOTE_SYSTEM_PROMPT
    chapter_note_prompt: str = DEFAULT_CHAPTER_NOTE_PROMPT
    timeline_prompt: str = DEFAULT_TIMELINE_PROMPT
    long_text_rewrite_system_prompt: str = DEFAULT_LONG_TEXT_REWRITE_SYSTEM_PROMPT
    long_text_rewrite_prompt: str = DEFAULT_LONG_TEXT_REWRITE_PROMPT
    neo4j_enabled: bool = False
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password123"
    embedding_enabled: bool = True
    embedding_model: str = "BAAI/bge-m3"
    embedding_device: str = "cuda:0"
    embedding_use_fp16: bool = True
    embedding_dimension: int = 1024
    kg_extraction_prompt: str = DEFAULT_KG_EXTRACTION_PROMPT
    kg_relation_prompt: str = DEFAULT_KG_RELATION_PROMPT
    kg_concept_prompt: str = DEFAULT_KG_CONCEPT_PROMPT
    kg_expand_prompt: str = DEFAULT_KG_EXPAND_PROMPT
    kg_chat_prompt: str = DEFAULT_KG_CHAT_PROMPT
    quick_summary_prompt: str = DEFAULT_QUICK_SUMMARY_PROMPT

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
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
                with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                    user_settings = json.load(f)
                    if "framework_prompt" in user_settings:
                        self._settings.framework_prompt = user_settings[
                            "framework_prompt"
                        ]
                    if "explain_prompt" in user_settings:
                        self._settings.explain_prompt = user_settings["explain_prompt"]
                    if "optimize_prompt" in user_settings:
                        self._settings.optimize_prompt = user_settings[
                            "optimize_prompt"
                        ]
                    if "quick_note_polish_prompt" in user_settings:
                        self._settings.quick_note_polish_prompt = user_settings[
                            "quick_note_polish_prompt"
                        ]
                    if "chapter_note_system_prompt" in user_settings:
                        self._settings.chapter_note_system_prompt = user_settings[
                            "chapter_note_system_prompt"
                        ]
                    if "chapter_note_prompt" in user_settings:
                        self._settings.chapter_note_prompt = user_settings[
                            "chapter_note_prompt"
                        ]
                    if "timeline_prompt" in user_settings:
                        self._settings.timeline_prompt = user_settings[
                            "timeline_prompt"
                        ]
                    if "long_text_rewrite_system_prompt" in user_settings:
                        self._settings.long_text_rewrite_system_prompt = user_settings[
                            "long_text_rewrite_system_prompt"
                        ]
                    if "long_text_rewrite_prompt" in user_settings:
                        self._settings.long_text_rewrite_prompt = user_settings[
                            "long_text_rewrite_prompt"
                        ]
                    if "api_base" in user_settings:
                        self._settings.openai_api_base = user_settings["api_base"]
                    if "openai_api_key" in user_settings:
                        self._settings.openai_api_key = user_settings["openai_api_key"]
                    if "model_name" in user_settings:
                        self._settings.model_name = user_settings["model_name"]
                    if "ai_backend_type" in user_settings:
                        self._settings.ai_backend_type = user_settings[
                            "ai_backend_type"
                        ]
                    if "opencode_cli_path" in user_settings:
                        self._settings.opencode_cli_path = user_settings[
                            "opencode_cli_path"
                        ]
                    if "batch_upload_size" in user_settings:
                        self._batch_upload_size = user_settings["batch_upload_size"]
                    else:
                        self._batch_upload_size = 5
                    if "neo4j_enabled" in user_settings:
                        self._settings.neo4j_enabled = user_settings["neo4j_enabled"]
                    if "neo4j_uri" in user_settings:
                        self._settings.neo4j_uri = user_settings["neo4j_uri"]
                    if "neo4j_user" in user_settings:
                        self._settings.neo4j_user = user_settings["neo4j_user"]
                    if "neo4j_password" in user_settings:
                        self._settings.neo4j_password = user_settings["neo4j_password"]
                    if "embedding_enabled" in user_settings:
                        self._settings.embedding_enabled = user_settings[
                            "embedding_enabled"
                        ]
                    if "embedding_model" in user_settings:
                        self._settings.embedding_model = user_settings[
                            "embedding_model"
                        ]
                    if "embedding_device" in user_settings:
                        self._settings.embedding_device = user_settings[
                            "embedding_device"
                        ]
                    if "kg_extraction_prompt" in user_settings:
                        self._settings.kg_extraction_prompt = user_settings[
                            "kg_extraction_prompt"
                        ]
                    if "kg_relation_prompt" in user_settings:
                        self._settings.kg_relation_prompt = user_settings[
                            "kg_relation_prompt"
                        ]
                    if "kg_concept_prompt" in user_settings:
                        self._settings.kg_concept_prompt = user_settings[
                            "kg_concept_prompt"
                        ]
                    if "kg_expand_prompt" in user_settings:
                        self._settings.kg_expand_prompt = user_settings[
                            "kg_expand_prompt"
                        ]
                    if "kg_chat_prompt" in user_settings:
                        self._settings.kg_chat_prompt = user_settings["kg_chat_prompt"]
                    if "quick_summary_prompt" in user_settings:
                        self._settings.quick_summary_prompt = user_settings["quick_summary_prompt"]
            except Exception as e:
                print(f"Failed to load user settings: {e}")
                self._batch_upload_size = 5
        else:
            self._batch_upload_size = 5

    def _save_user_settings(self):
        try:
            user_settings = {
                "framework_prompt": self._settings.framework_prompt,
                "explain_prompt": self._settings.explain_prompt,
                "optimize_prompt": self._settings.optimize_prompt,
                "quick_note_polish_prompt": self._settings.quick_note_polish_prompt,
                "chapter_note_system_prompt": self._settings.chapter_note_system_prompt,
                "chapter_note_prompt": self._settings.chapter_note_prompt,
                "timeline_prompt": self._settings.timeline_prompt,
                "long_text_rewrite_system_prompt": self._settings.long_text_rewrite_system_prompt,
                "long_text_rewrite_prompt": self._settings.long_text_rewrite_prompt,
                "api_base": self._settings.openai_api_base,
                "model_name": self._settings.model_name,
                "ai_backend_type": self._settings.ai_backend_type,
                "opencode_cli_path": self._settings.opencode_cli_path,
                "batch_upload_size": self._batch_upload_size,
                "neo4j_enabled": self._settings.neo4j_enabled,
                "neo4j_uri": self._settings.neo4j_uri,
                "neo4j_user": self._settings.neo4j_user,
                "neo4j_password": self._settings.neo4j_password,
                "embedding_enabled": self._settings.embedding_enabled,
                "embedding_model": self._settings.embedding_model,
                "embedding_device": self._settings.embedding_device,
                "kg_extraction_prompt": self._settings.kg_extraction_prompt,
                "kg_relation_prompt": self._settings.kg_relation_prompt,
                "kg_concept_prompt": self._settings.kg_concept_prompt,
                "kg_expand_prompt": self._settings.kg_expand_prompt,
                "kg_chat_prompt": self._settings.kg_chat_prompt,
                "quick_summary_prompt": self._settings.quick_summary_prompt,
            }
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
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
    def chapter_note_system_prompt(self) -> str:
        return self._settings.chapter_note_system_prompt

    @property
    def chapter_note_prompt(self) -> str:
        return self._settings.chapter_note_prompt

    @property
    def timeline_prompt(self) -> str:
        return self._settings.timeline_prompt

    @property
    def long_text_rewrite_system_prompt(self) -> str:
        return self._settings.long_text_rewrite_system_prompt

    @property
    def long_text_rewrite_prompt(self) -> str:
        return self._settings.long_text_rewrite_prompt

    @property
    def ai_backend_type(self) -> str:
        return self._settings.ai_backend_type

    @property
    def opencode_cli_path(self) -> str:
        return self._settings.opencode_cli_path

    @property
    def batch_upload_size(self) -> int:
        return self._batch_upload_size

    @property
    def neo4j_enabled(self) -> bool:
        return self._settings.neo4j_enabled

    @property
    def neo4j_uri(self) -> str:
        return self._settings.neo4j_uri

    @property
    def neo4j_user(self) -> str:
        return self._settings.neo4j_user

    @property
    def neo4j_password(self) -> str:
        return self._settings.neo4j_password

    @property
    def embedding_enabled(self) -> bool:
        return self._settings.embedding_enabled

    @property
    def embedding_model(self) -> str:
        return self._settings.embedding_model

    @property
    def embedding_dimension(self) -> int:
        return self._settings.embedding_dimension

    @property
    def embedding_device(self) -> str:
        return self._settings.embedding_device

    @property
    def kg_extraction_prompt(self) -> str:
        return self._settings.kg_extraction_prompt

    @property
    def kg_relation_prompt(self) -> str:
        return self._settings.kg_relation_prompt

    @property
    def kg_concept_prompt(self) -> str:
        return self._settings.kg_concept_prompt

    @property
    def kg_expand_prompt(self) -> str:
        return self._settings.kg_expand_prompt

    @property
    def kg_chat_prompt(self) -> str:
        return self._settings.kg_chat_prompt

    @property
    def quick_summary_prompt(self) -> str:
        return self._settings.quick_summary_prompt

    def update(
        self,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        model_name: Optional[str] = None,
        ai_backend_type: Optional[str] = None,
        opencode_cli_path: Optional[str] = None,
        framework_prompt: Optional[str] = None,
        explain_prompt: Optional[str] = None,
        optimize_prompt: Optional[str] = None,
        quick_note_polish_prompt: Optional[str] = None,
        chapter_note_system_prompt: Optional[str] = None,
        chapter_note_prompt: Optional[str] = None,
        timeline_prompt: Optional[str] = None,
        long_text_rewrite_system_prompt: Optional[str] = None,
        long_text_rewrite_prompt: Optional[str] = None,
        batch_upload_size: Optional[int] = None,
        neo4j_enabled: Optional[bool] = None,
        neo4j_uri: Optional[str] = None,
        neo4j_user: Optional[str] = None,
        neo4j_password: Optional[str] = None,
        embedding_enabled: Optional[bool] = None,
        embedding_model: Optional[str] = None,
        embedding_device: Optional[str] = None,
        kg_extraction_prompt: Optional[str] = None,
        kg_relation_prompt: Optional[str] = None,
        kg_concept_prompt: Optional[str] = None,
        kg_expand_prompt: Optional[str] = None,
        kg_chat_prompt: Optional[str] = None,
        quick_summary_prompt: Optional[str] = None,
    ):
        if api_key is not None:
            self._settings.openai_api_key = api_key
        if api_base is not None:
            self._settings.openai_api_base = api_base
        if model_name is not None:
            self._settings.model_name = model_name
        if ai_backend_type is not None:
            self._settings.ai_backend_type = ai_backend_type
        if opencode_cli_path is not None:
            self._settings.opencode_cli_path = opencode_cli_path
        if framework_prompt is not None:
            self._settings.framework_prompt = framework_prompt
        if explain_prompt is not None:
            self._settings.explain_prompt = explain_prompt
        if optimize_prompt is not None:
            self._settings.optimize_prompt = optimize_prompt
        if quick_note_polish_prompt is not None:
            self._settings.quick_note_polish_prompt = quick_note_polish_prompt
        if chapter_note_system_prompt is not None:
            self._settings.chapter_note_system_prompt = chapter_note_system_prompt
        if chapter_note_prompt is not None:
            self._settings.chapter_note_prompt = chapter_note_prompt
        if timeline_prompt is not None:
            self._settings.timeline_prompt = timeline_prompt
        if long_text_rewrite_system_prompt is not None:
            self._settings.long_text_rewrite_system_prompt = (
                long_text_rewrite_system_prompt
            )
        if long_text_rewrite_prompt is not None:
            self._settings.long_text_rewrite_prompt = long_text_rewrite_prompt
        if batch_upload_size is not None:
            if 1 <= batch_upload_size <= 10:
                self._batch_upload_size = batch_upload_size
        if neo4j_enabled is not None:
            self._settings.neo4j_enabled = neo4j_enabled
        if neo4j_uri is not None:
            self._settings.neo4j_uri = neo4j_uri
        if neo4j_user is not None:
            self._settings.neo4j_user = neo4j_user
        if neo4j_password is not None:
            self._settings.neo4j_password = neo4j_password
        if embedding_enabled is not None:
            self._settings.embedding_enabled = embedding_enabled
        if embedding_model is not None:
            self._settings.embedding_model = embedding_model
        if embedding_device is not None:
            self._settings.embedding_device = embedding_device
        if kg_extraction_prompt is not None:
            self._settings.kg_extraction_prompt = kg_extraction_prompt
        if kg_relation_prompt is not None:
            self._settings.kg_relation_prompt = kg_relation_prompt
        if kg_concept_prompt is not None:
            self._settings.kg_concept_prompt = kg_concept_prompt
        if kg_expand_prompt is not None:
            self._settings.kg_expand_prompt = kg_expand_prompt
        if kg_chat_prompt is not None:
            self._settings.kg_chat_prompt = kg_chat_prompt
        if quick_summary_prompt is not None:
            self._settings.quick_summary_prompt = quick_summary_prompt
        self._save_user_settings()

    def get_all(self) -> dict:
        return {
            "api_key": self._settings.openai_api_key,
            "api_base": self._settings.openai_api_base,
            "model_name": self._settings.model_name,
            "ai_backend_type": self._settings.ai_backend_type,
            "opencode_cli_path": self._settings.opencode_cli_path,
            "framework_prompt": self._settings.framework_prompt,
            "explain_prompt": self._settings.explain_prompt,
            "optimize_prompt": self._settings.optimize_prompt,
            "quick_note_polish_prompt": self._settings.quick_note_polish_prompt,
            "chapter_note_system_prompt": self._settings.chapter_note_system_prompt,
            "chapter_note_prompt": self._settings.chapter_note_prompt,
            "timeline_prompt": self._settings.timeline_prompt,
            "long_text_rewrite_system_prompt": self._settings.long_text_rewrite_system_prompt,
            "long_text_rewrite_prompt": self._settings.long_text_rewrite_prompt,
            "batch_upload_size": self._batch_upload_size,
            "neo4j_enabled": self._settings.neo4j_enabled,
            "neo4j_uri": self._settings.neo4j_uri,
            "neo4j_user": self._settings.neo4j_user,
            "neo4j_password": self._settings.neo4j_password,
            "embedding_enabled": self._settings.embedding_enabled,
            "embedding_model": self._settings.embedding_model,
            "embedding_device": self._settings.embedding_device,
            "kg_extraction_prompt": self._settings.kg_extraction_prompt,
            "kg_relation_prompt": self._settings.kg_relation_prompt,
            "kg_concept_prompt": self._settings.kg_concept_prompt,
            "kg_expand_prompt": self._settings.kg_expand_prompt,
            "kg_chat_prompt": self._settings.kg_chat_prompt,
            "quick_summary_prompt": self._settings.quick_summary_prompt,
        }


settings_manager = SettingsManager()
settings = settings_manager
