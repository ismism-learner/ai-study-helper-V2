"""
长文本分段填充改写服务

工作流程：
1. 解析原文 → 按小节拆分
2. 生成标识符 → ***=== 1.7.1 标题 ===*** 格式
3. 生成缩略框架 → 每个小节只保留标题和标识符
4. 逐个填充 → 发送原文对应段落 + 缩略标题 → AI填充
5. 拼接输出 → 合并所有填充结果
"""

import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import List, Optional, Tuple

from app.config import settings_manager
from app.services.ai_service import ai_service


@dataclass
class Section:
    """章节结构"""

    level: int  # 层级（1=章，2=节，3=小节）
    number: str  # 编号（如 "1.7.1"）
    title: str  # 标题
    content: str  # 原文内容
    identifier: str  # 标识符


# 标识符格式
IDENTIFIER_PREFIX = "***==="
IDENTIFIER_SUFFIX = "===***"

# 默认改写提示词
DEFAULT_REWRITE_SYSTEM_PROMPT = """你是一个专业的文本改写助手。你的任务是将原文改写成通俗易懂、口语化的版本。

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

DEFAULT_REWRITE_PROMPT = """请根据原文内容，填充并改写以下小节。

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

DEFAULT_FRAMEWORK_PROMPT = """请分析以下文章，提取出完整的章节结构。

【原文】
{content}

【任务】
1. 识别所有章节标题（如"1.1"、"1.2.1"等）
2. 保持原有的层级关系
3. 输出每个章节的编号和标题

【输出格式】
按层级缩进输出，格式如：
1 章节标题
  1.1 节标题
    1.1.1 小节标题

请输出章节结构："""


def extract_sections(text: str) -> list[Section]:
    """
    从文本中提取章节结构

    支持的格式：
    - "第1章 xxx" 或 "1 xxx"
    - "1.1 xxx"
    - "1.1.1 xxx"
    """
    sections = []
    lines = text.split("\n")

    # 章节标题正则
    chapter_pattern = re.compile(r"^第?(\d+)[章\s]+(.+)$")
    section_pattern = re.compile(r"^(\d+\.\d+(?:\.\d+)?)\s+(.+)$")

    current_section = None
    current_content = []

    for line in lines:
        line_stripped = line.strip()

        # 检查是否是章节标题
        chapter_match = chapter_pattern.match(line_stripped)
        section_match = section_pattern.match(line_stripped)

        if chapter_match:
            # 保存上一个章节
            if current_section:
                current_section.content = "\n".join(current_content).strip()
                sections.append(current_section)

            # 开始新章节
            number = chapter_match.group(1)
            title = chapter_match.group(2).strip()
            current_section = Section(
                level=1,
                number=number,
                title=title,
                content="",
                identifier=f"{IDENTIFIER_PREFIX} {number} {title} {IDENTIFIER_SUFFIX}",
            )
            current_content = [line]

        elif section_match:
            # 保存上一个章节
            if current_section:
                current_section.content = "\n".join(current_content).strip()
                sections.append(current_section)

            # 开始新章节
            number = section_match.group(1)
            title = section_match.group(2).strip()

            # 计算层级
            level = number.count(".") + 1

            current_section = Section(
                level=level,
                number=number,
                title=title,
                content="",
                identifier=f"{IDENTIFIER_PREFIX} {number} {title} {IDENTIFIER_SUFFIX}",
            )
            current_content = [line]

        elif current_section:
            current_content.append(line)

    # 保存最后一个章节
    if current_section:
        current_section.content = "\n".join(current_content).strip()
        sections.append(current_section)

    return sections


def generate_framework(sections: list[Section]) -> str:
    """
    生成缩略框架
    每个小节只保留标识符和标题
    """
    framework_lines = []
    for section in sections:
        indent = "  " * (section.level - 1)
        framework_lines.append(f"{indent}{section.identifier}")
    return "\n".join(framework_lines)


def split_text_by_sections(
    text: str, max_chunk_size: int = 50000
) -> list[tuple[str, str]]:
    """
    将文本按章节分割成多个块

    返回：[(章节编号范围, 内容块), ...]
    """
    sections = extract_sections(text)

    if not sections:
        # 如果没有识别到章节，直接返回整个文本
        return [("全文", text)]

    chunks = []
    current_chunk = ""
    current_range = ""
    start_number = None

    for section in sections:
        section_text = section.content + "\n\n"

        if len(current_chunk) + len(section_text) > max_chunk_size and current_chunk:
            # 当前块已满，保存并开始新块
            end_number = section.number if sections else sections[-1].number
            current_range = (
                f"{start_number} - {end_number}"
                if start_number != end_number
                else start_number
            )
            chunks.append((current_range, current_chunk.strip()))
            current_chunk = section_text
            start_number = section.number
        else:
            if not current_chunk:
                start_number = section.number
            current_chunk += section_text

    # 保存最后一块
    if current_chunk:
        end_number = sections[-1].number if sections else ""
        current_range = (
            f"{start_number} - {end_number}"
            if start_number != end_number
            else start_number
        )
        chunks.append((current_range, current_chunk.strip()))

    return chunks


async def rewrite_section(
    section: Section,
    context: str = "",
    system_prompt: str | None = None,
    user_prompt: str | None = None,
) -> str:
    """
    改写单个章节

    Args:
        section: 章节对象
        context: 上下文（前文内容）
        system_prompt: 系统提示词
        user_prompt: 用户提示词模板

    Returns:
        改写后的章节内容
    """
    sys_prompt = (
        system_prompt
        or settings_manager._settings.long_text_rewrite_system_prompt
        or DEFAULT_REWRITE_SYSTEM_PROMPT
    )
    usr_prompt_template = (
        user_prompt
        or settings_manager._settings.long_text_rewrite_prompt
        or DEFAULT_REWRITE_PROMPT
    )

    # 构建提示词
    usr_prompt = usr_prompt_template.format(
        original_content=section.content, section_identifier=section.identifier
    )

    # 如果有上下文，添加到提示词中
    if context:
        usr_prompt = f"""【前文上下文】
{context[-2000:]}

{usr_prompt}"""

    result = await ai_service.generate_text(
        prompt=usr_prompt, system_prompt=sys_prompt, max_tokens=8192
    )

    return result


async def rewrite_long_text(
    text: str,
    system_prompt: str | None = None,
    user_prompt: str | None = None,
    progress_callback = None,
) -> str:
    """
    改写长文本

    Args:
        text: 原文
        system_prompt: 系统提示词
        user_prompt: 用户提示词模板
        progress_callback: 进度回调函数 callback(current, total, section_title)

    Returns:
        改写后的完整文本
    """
    # 1. 提取章节
    sections = extract_sections(text)

    if not sections:
        # 如果没有识别到章节，直接改写整个文本
        section = Section(
            level=1,
            number="1",
            title="全文",
            content=text,
            identifier=f"{IDENTIFIER_PREFIX} 全文 {IDENTIFIER_SUFFIX}",
        )
        sections = [section]

    total = len(sections)
    results = []
    context = ""

    # 2. 逐个改写
    for i, section in enumerate(sections):
        if progress_callback:
            progress_callback(i + 1, total, section.title)

        print(
            f"[rewrite_long_text] 正在改写: {section.number} {section.title} ({i + 1}/{total})"
        )

        rewritten = await rewrite_section(
            section=section,
            context=context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

        results.append(rewritten)

        # 保存最后500字作为上下文
        context = rewritten[-500:] if len(rewritten) > 500 else rewritten

    # 3. 拼接结果
    return "\n\n".join(results)


async def rewrite_long_text_stream(
    text: str, system_prompt: str | None = None, user_prompt: str | None = None
) -> AsyncGenerator[str, None]:
    """
    流式改写长文本

    Yields:
        改写进度和内容
    """
    # 1. 提取章节
    sections = extract_sections(text)

    if not sections:
        section = Section(
            level=1,
            number="1",
            title="全文",
            content=text,
            identifier=f"{IDENTIFIER_PREFIX} 全文 {IDENTIFIER_SUFFIX}",
        )
        sections = [section]

    total = len(sections)
    context = ""

    # 发送开始信息
    yield f"[进度] 共识别到 {total} 个章节，开始改写...\n\n"

    # 2. 逐个改写
    for i, section in enumerate(sections):
        yield f"[进度] 正在改写: {section.number} {section.title} ({i + 1}/{total})\n\n"

        rewritten = await rewrite_section(
            section=section,
            context=context,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

        # 输出改写后的内容
        yield rewritten + "\n\n"

        # 保存上下文
        context = rewritten[-500:] if len(rewritten) > 500 else rewritten

    yield f"[进度] 改写完成！共处理 {total} 个章节。\n"


# 便捷函数
async def rewrite_text(text: str, style: str = "通俗化") -> str:
    """
    便捷改写函数

    Args:
        text: 原文
        style: 改写风格（通俗化、学术化、精简等）

    Returns:
        改写后的文本
    """
    return await rewrite_long_text(text)
