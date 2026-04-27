"""AI提示词默认值 — 所有提示词集中定义于此"""
# 该文件仅用于为 config.py 提供默认提示词值
# 新增提示词时只需在此添加定义，并在 config.py 的 SETTINGS_REGISTRY 中注册

# ==================== 文档操作 ====================

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

# ==================== 快速笔记 ====================

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

# ==================== 章节笔记 ====================

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

# ==================== 长文本改写 ====================

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

# ==================== 笔记润色/生成 ====================

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

# ==================== 章节结构分析 ====================

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

# ==================== 知识图谱 & 认知链 ====================

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

DEFAULT_KG_CONCEPT_USER_PROMPT = """请解释以下概念：
概念：{concept}
{context_section}"""

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

# ==================== 默认提示词映射表 ====================
# settings_key -> 默认提示词常量
# 在 Settings.__init__ 中使用此表填充空字符串默认值
# 在新增提示词时：1) 在此定义常量 2) 在此添加映射 3) 在 config.SETTINGS_REGISTRY 中注册

DEFAULT_PROMPTS_MAP: dict[str, str] = {
    "framework_prompt": DEFAULT_FRAMEWORK_PROMPT,
    "explain_prompt": DEFAULT_EXPLAIN_PROMPT,
    "optimize_prompt": DEFAULT_OPTIMIZE_PROMPT,
    "timeline_prompt": DEFAULT_TIMELINE_PROMPT,
    "quick_note_polish_prompt": DEFAULT_QUICK_NOTE_POLISH_PROMPT,
    "chapter_note_system_prompt": DEFAULT_CHAPTER_NOTE_SYSTEM_PROMPT,
    "chapter_note_prompt": DEFAULT_CHAPTER_NOTE_PROMPT,
    "long_text_rewrite_system_prompt": DEFAULT_LONG_TEXT_REWRITE_SYSTEM_PROMPT,
    "long_text_rewrite_prompt": DEFAULT_LONG_TEXT_REWRITE_PROMPT,
    "polish_note_prompt": DEFAULT_POLISH_NOTE_PROMPT,
    "polish_note_system_prompt": DEFAULT_POLISH_NOTE_SYSTEM_PROMPT,
    "generate_note_prompt": DEFAULT_GENERATE_NOTE_PROMPT,
    "generate_note_system_prompt": DEFAULT_GENERATE_NOTE_SYSTEM_PROMPT,
    "structure_system_prompt": DEFAULT_STRUCTURE_SYSTEM_PROMPT,
    "structure_user_prompt": DEFAULT_STRUCTURE_USER_PROMPT,
    "section_fill_prompt": DEFAULT_SECTION_FILL_PROMPT,
    "kg_concept_prompt": DEFAULT_KG_CONCEPT_PROMPT,
    "kg_concept_user_prompt": DEFAULT_KG_CONCEPT_USER_PROMPT,
    "quick_summary_prompt": DEFAULT_QUICK_SUMMARY_PROMPT,
}
