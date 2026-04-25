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


# 认知链概念解释提示词
DEFAULT_POLISH_NOTE_PROMPT = """请润色以下笔记内容，要求：

1. 将口语化表达转换为更规范的书面化表达
2. 保持原有内容和意思不变
3. 删除重复性内容
4. 优化句子结构，使其更加通顺流畅
5. 保留关键信息和重要细节
6. 不要添加原文中没有的内容

笔记内容：
{note_content}

请直接输出润色后的内容，不要添加任何解释说明。"""

DEFAULT_POLISH_NOTE_SYSTEM_PROMPT = "你是一个专业的笔记编辑助手，擅长将口语化的笔记内容转换为清晰、规范的书面化表达，同时保持内容的完整性和准确性。"

# 笔记生成提示词
DEFAULT_GENERATE_NOTE_PROMPT = """请根据以下笔记内容，生成一个规范的笔记标题和润色后的内容。

要求：
1. 标题：简洁明了，能够概括笔记的核心内容（不超过20个字）
2. 内容：将口语化表达转换为规范的书面化表达，删除重复性内容，优化句子结构
3. 保持原有内容和意思不变
4. 保留关键信息和重要细节
5. 不要添加原文中没有的内容

笔记内容：
{note_content}

请严格按照以下JSON格式输出，不要添加任何其他内容：
{{
  "title": "生成的标题",
  "content": "润色后的内容"
}}"""

DEFAULT_GENERATE_NOTE_SYSTEM_PROMPT = "你是一个专业的笔记编辑助手，擅长根据用户输入的内容生成规范的笔记标题和润色后的内容。你必须严格按照JSON格式输出。"

# 章节结构分析提示词
DEFAULT_STRUCTURE_SYSTEM_PROMPT = """你是一个专业的文档结构分析助手。你的任务是分析OCR识别的原始文本，提取出文档的章节结构，并标注每个章节在原文中的行号范围。

【输出格式】
你必须输出一个严格的JSON对象，格式如下：
{
  "book_title": "书籍/文档标题",
  "total_chapters": 章节总数,
  "chapters": [
    {
      "index": 0,
      "title": "第一章标题",
      "summary": "该章节内容的简短概述（50字以内）",
      "start_line": 1,
      "end_line": 50,
      "sections": [
        {
          "title": "1.1 小节标题",
          "summary": "该小节内容的简短概述（30字以内）",
          "key_points": ["要点1", "要点2"],
          "start_line": 5,
          "end_line": 25
        }
      ]
    }
  ]
}

【行号规则 - 极其重要！】
1. 原文的第一行是第1行（不是第0行）
2. start_line：该章节/小节内容在原文中开始的行号
3. end_line：该章节/小节内容在原文中结束的行号（包含该行）
4. 行号必须准确，因为系统会根据行号从原文中切分出对应内容
5. 章节之间不应有行号重叠，上一章的end_line+1应等于下一章的start_line
6. 如果无法精确判断行号，给出估算值即可

【重要规则】
1. 只输出JSON，不要输出任何其他内容
2. JSON必须是合法的，可以被json.loads()解析
3. chapters数组的顺序必须与原文中章节出现的顺序一致
4. summary要简短精炼，不要长篇大论
5. key_points只提取3-5个最重要的要点
6. 如果原文没有明显的小节划分，sections可以为空数组
7. 禁止使用任何emoji表情符号
8. start_line和end_line是必填字段，不能省略"""

DEFAULT_STRUCTURE_USER_PROMPT = """请分析以下OCR识别的原始文本，提取出文档的章节结构，并标注每个章节在原文中的行号范围。

文档标题：{chapter_title}

原始文本（带行号前缀）：
{numbered_text}

请直接输出JSON格式的章节结构表，不要输出任何其他内容。确保每个章节都有准确的start_line和end_line。"""

# 章节填充提示词
DEFAULT_SECTION_FILL_PROMPT = """请将以下OCR识别的原始文本整理成结构清晰、通俗易懂的Markdown格式笔记。

【全书结构表】（供参考，了解当前章节在全书中的位置）
{structure}

【当前章节信息】
章节标题：{section_title}
章节概述：{section_summary}

【当前章节的原始文本】
{section_text}

【重要提醒】
- 禁止使用任何emoji表情符号
- 只使用纯文本和Markdown格式
- 只输出当前章节的整理内容，不要输出其他章节的内容
- 直接输出整理后的Markdown内容，不要添加任何解释说明"""

# 认知链概念解释系统提示词
DEFAULT_KG_CONCEPT_PROMPT = """你是一个知识渊博的导师，请用通俗易懂的方式详细解释概念。
输出格式要求（必须严格遵循，只输出JSON，不要有其他内容）：
```json
{
  "label": "概念简称（2-8个字）",
  "definition": "用通俗易懂的方式详细解释这个概念（100-200字）",
  "domain": "所属领域",
  "key_concepts": ["相关概念1", "相关概念2"],
  "suggested_questions": ["追问建议1", "追问建议2"]
}
```

重要规则：
1. label 必须是简短精炼的概念名称，不是文本片段
2. definition 必须用通俗易懂的方式详细解释，不要用专业术语堆砌
3. 只输出JSON，不要有任何其他文字"""

# 认知链概念解释用户提示词
DEFAULT_KG_CONCEPT_USER_PROMPT = """请解释以下概念：
概念：{concept}
{context_section}"""

# 知识图谱快速梳理提示词
DEFAULT_QUICK_SUMMARY_PROMPT = """请快速梳理以下文本的核心内容和逻辑结构。
输出格式要求（必须严格遵循，只输出JSON，不要有其他内容）：
```json
{
  "label": "章节/段落标题（简短概括，2-10个字）",
  "definition": "核心内容概述（50-100字，通俗易懂）",
  "key_concepts": ["核心概念1", "核心概念2", "核心概念3"],
  "suggested_questions": ["追问建议1", "追问建议2"]
}
```

重要规则：
1. label 必须是简短精炼的标题，不是文本片段
2. definition 必须用通俗易懂的方式概括核心内容
3. 只输出JSON，不要有任何其他文字"""


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
    embedding_enabled: bool = True
    embedding_model: str = "BAAI/bge-m3"
    embedding_device: str = "cuda:0"
    embedding_use_fp16: bool = True
    embedding_dimension: int = 1024
    kg_concept_prompt: str = DEFAULT_KG_CONCEPT_PROMPT
    quick_summary_prompt: str = DEFAULT_QUICK_SUMMARY_PROMPT
    polish_note_prompt: str = DEFAULT_POLISH_NOTE_PROMPT
    polish_note_system_prompt: str = DEFAULT_POLISH_NOTE_SYSTEM_PROMPT
    generate_note_prompt: str = DEFAULT_GENERATE_NOTE_PROMPT
    generate_note_system_prompt: str = DEFAULT_GENERATE_NOTE_SYSTEM_PROMPT
    structure_system_prompt: str = DEFAULT_STRUCTURE_SYSTEM_PROMPT
    structure_user_prompt: str = DEFAULT_STRUCTURE_USER_PROMPT
    section_fill_prompt: str = DEFAULT_SECTION_FILL_PROMPT
    kg_concept_user_prompt: str = DEFAULT_KG_CONCEPT_USER_PROMPT

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
                    if "kg_concept_prompt" in user_settings:
                        self._settings.kg_concept_prompt = user_settings[
                            "kg_concept_prompt"
                        ]
                    if "quick_summary_prompt" in user_settings:
                        self._settings.quick_summary_prompt = user_settings[
                            "quick_summary_prompt"
                        ]
                    if "polish_note_prompt" in user_settings:
                        self._settings.polish_note_prompt = user_settings[
                            "polish_note_prompt"
                        ]
                    if "polish_note_system_prompt" in user_settings:
                        self._settings.polish_note_system_prompt = user_settings[
                            "polish_note_system_prompt"
                        ]
                    if "generate_note_prompt" in user_settings:
                        self._settings.generate_note_prompt = user_settings[
                            "generate_note_prompt"
                        ]
                    if "generate_note_system_prompt" in user_settings:
                        self._settings.generate_note_system_prompt = user_settings[
                            "generate_note_system_prompt"
                        ]
                    if "structure_system_prompt" in user_settings:
                        self._settings.structure_system_prompt = user_settings[
                            "structure_system_prompt"
                        ]
                    if "structure_user_prompt" in user_settings:
                        self._settings.structure_user_prompt = user_settings[
                            "structure_user_prompt"
                        ]
                    if "section_fill_prompt" in user_settings:
                        self._settings.section_fill_prompt = user_settings[
                            "section_fill_prompt"
                        ]
                    if "kg_concept_user_prompt" in user_settings:
                        self._settings.kg_concept_user_prompt = user_settings[
                            "kg_concept_user_prompt"
                        ]
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
                "embedding_enabled": self._settings.embedding_enabled,
                "embedding_model": self._settings.embedding_model,
                "embedding_device": self._settings.embedding_device,
                "kg_concept_prompt": self._settings.kg_concept_prompt,
                "quick_summary_prompt": self._settings.quick_summary_prompt,
                "polish_note_prompt": self._settings.polish_note_prompt,
                "polish_note_system_prompt": self._settings.polish_note_system_prompt,
                "generate_note_prompt": self._settings.generate_note_prompt,
                "generate_note_system_prompt": self._settings.generate_note_system_prompt,
                "structure_system_prompt": self._settings.structure_system_prompt,
                "structure_user_prompt": self._settings.structure_user_prompt,
                "section_fill_prompt": self._settings.section_fill_prompt,
                "kg_concept_user_prompt": self._settings.kg_concept_user_prompt,
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
    def kg_concept_prompt(self) -> str:
        return self._settings.kg_concept_prompt

    @property
    def quick_summary_prompt(self) -> str:
        return self._settings.quick_summary_prompt

    @property
    def polish_note_prompt(self) -> str:
        return self._settings.polish_note_prompt

    @property
    def polish_note_system_prompt(self) -> str:
        return self._settings.polish_note_system_prompt

    @property
    def generate_note_prompt(self) -> str:
        return self._settings.generate_note_prompt

    @property
    def generate_note_system_prompt(self) -> str:
        return self._settings.generate_note_system_prompt

    @property
    def structure_system_prompt(self) -> str:
        return self._settings.structure_system_prompt

    @property
    def structure_user_prompt(self) -> str:
        return self._settings.structure_user_prompt

    @property
    def section_fill_prompt(self) -> str:
        return self._settings.section_fill_prompt

    @property
    def kg_concept_user_prompt(self) -> str:
        return self._settings.kg_concept_user_prompt

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
        embedding_enabled: Optional[bool] = None,
        embedding_model: Optional[str] = None,
        embedding_device: Optional[str] = None,
        kg_concept_prompt: Optional[str] = None,
        quick_summary_prompt: Optional[str] = None,
        polish_note_prompt: Optional[str] = None,
        polish_note_system_prompt: Optional[str] = None,
        generate_note_prompt: Optional[str] = None,
        generate_note_system_prompt: Optional[str] = None,
        structure_system_prompt: Optional[str] = None,
        structure_user_prompt: Optional[str] = None,
        section_fill_prompt: Optional[str] = None,
        kg_concept_user_prompt: Optional[str] = None,
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
        if embedding_enabled is not None:
            self._settings.embedding_enabled = embedding_enabled
        if embedding_model is not None:
            self._settings.embedding_model = embedding_model
        if embedding_device is not None:
            self._settings.embedding_device = embedding_device
        if kg_concept_prompt is not None:
            self._settings.kg_concept_prompt = kg_concept_prompt
        if quick_summary_prompt is not None:
            self._settings.quick_summary_prompt = quick_summary_prompt
        if polish_note_prompt is not None:
            self._settings.polish_note_prompt = polish_note_prompt
        if polish_note_system_prompt is not None:
            self._settings.polish_note_system_prompt = polish_note_system_prompt
        if generate_note_prompt is not None:
            self._settings.generate_note_prompt = generate_note_prompt
        if generate_note_system_prompt is not None:
            self._settings.generate_note_system_prompt = generate_note_system_prompt
        if structure_system_prompt is not None:
            self._settings.structure_system_prompt = structure_system_prompt
        if structure_user_prompt is not None:
            self._settings.structure_user_prompt = structure_user_prompt
        if section_fill_prompt is not None:
            self._settings.section_fill_prompt = section_fill_prompt
        if kg_concept_user_prompt is not None:
            self._settings.kg_concept_user_prompt = kg_concept_user_prompt
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
            "embedding_enabled": self._settings.embedding_enabled,
            "embedding_model": self._settings.embedding_model,
            "embedding_device": self._settings.embedding_device,
            "kg_concept_prompt": self._settings.kg_concept_prompt,
            "quick_summary_prompt": self._settings.quick_summary_prompt,
            "polish_note_prompt": self._settings.polish_note_prompt,
            "polish_note_system_prompt": self._settings.polish_note_system_prompt,
            "generate_note_prompt": self._settings.generate_note_prompt,
            "generate_note_system_prompt": self._settings.generate_note_system_prompt,
            "structure_system_prompt": self._settings.structure_system_prompt,
            "structure_user_prompt": self._settings.structure_user_prompt,
            "section_fill_prompt": self._settings.section_fill_prompt,
            "kg_concept_user_prompt": self._settings.kg_concept_user_prompt,
        }


settings_manager = SettingsManager()
settings = settings_manager
