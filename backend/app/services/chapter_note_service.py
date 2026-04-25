from app.services.ai_service import ai_service
from app.config import settings_manager
import json

# Token估算常量
# GLM-5.1: 200K上下文窗口，最大输出128K tokens
# 中文字符约等于1.16 tokens（阿里云实证研究）
# 输入5万字（约58K tokens）+ 输出3万字（约35K tokens）= 93K tokens，安全范围
MAX_CONTEXT_TOKENS = 150000  # 安全token上限
MAX_CHINESE_CHARS = 50000  # 约58000 tokens，留空间给输出


def estimate_tokens(text: str) -> int:
    """估算文本的token数量（中文1.16，其他0.25）"""
    if not text:
        return 0
    chinese_chars = sum(1 for c in text if "\u4e00" <= c <= "\u9fff")
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 1.16 + other_chars * 0.25)


async def generate_chapter_note(
    original_text: str, chapter_title: str = "未命名章节"
) -> str:
    """
    生成章节笔记，支持超长文本分段处理
    - 估算token数量，超过上限则分段
    - 分段时传递前一段笔记作为上下文，让AI继续补完
    """
    system_prompt = settings_manager.chapter_note_system_prompt
    prompt_template = settings_manager.chapter_note_prompt

    text_len = len(original_text)
    estimated_tokens = estimate_tokens(original_text)
    print(
        f"[generate_chapter_note] 文本: {text_len}字符, 估算: {estimated_tokens}tokens, 上限: {MAX_CHINESE_CHARS}字符"
    )

    # 不超过上限，直接处理
    if text_len <= MAX_CHINESE_CHARS:
        prompt = prompt_template.format(
            chapter_title=chapter_title, original_text=original_text
        )
        return await ai_service.generate_text(
            prompt=prompt, system_prompt=system_prompt
        )

    # 超长文本分段处理
    print(f"[generate_chapter_note] 超长文本，启动分段处理...")

    # 按字符数分割（简单直接）
    chunks = []
    for i in range(0, text_len, MAX_CHINESE_CHARS):
        chunks.append(original_text[i : i + MAX_CHINESE_CHARS])

    print(f"[generate_chapter_note] 分为 {len(chunks)} 段")

    all_notes = []
    previous_note = ""

    for i, chunk in enumerate(chunks):
        print(
            f"[generate_chapter_note] 处理第 {i + 1}/{len(chunks)} 段 ({len(chunk)}字符)"
        )

        if previous_note:
            # 有之前的笔记，让AI继续补完
            prompt = f"""这是《{chapter_title}》章节前面部分的笔记：

{previous_note[-3000:]}

---

请继续整理以下内容，保持与前面笔记的风格和结构一致：

{chunk}"""
        else:
            prompt = prompt_template.format(
                chapter_title=chapter_title, original_text=chunk
            )

        result = await ai_service.generate_text(
            prompt=prompt, system_prompt=system_prompt
        )
        all_notes.append(result)
        previous_note = result

    return "\n\n---\n\n".join(all_notes)


async def generate_chapter_note_stream(
    original_text: str, chapter_title: str = "未命名章节"
):
    """
    生成章节笔记（流式），支持超长文本分段处理
    """
    system_prompt = settings_manager.chapter_note_system_prompt
    prompt_template = settings_manager.chapter_note_prompt

    text_len = len(original_text)
    estimated_tokens = estimate_tokens(original_text)
    print(
        f"[generate_chapter_note_stream] 文本: {text_len}字符, 估算: {estimated_tokens}tokens"
    )

    # 不超过上限，直接处理
    if text_len <= MAX_CHINESE_CHARS:
        prompt = prompt_template.format(
            chapter_title=chapter_title, original_text=original_text
        )
        async for chunk in ai_service.generate_text_stream(
            prompt=prompt, system_prompt=system_prompt
        ):
            yield chunk
        return

    # 超长文本分段处理
    print(f"[generate_chapter_note_stream] 超长文本，启动分段处理...")

    chunks = []
    for i in range(0, text_len, MAX_CHINESE_CHARS):
        chunks.append(original_text[i : i + MAX_CHINESE_CHARS])

    print(f"[generate_chapter_note_stream] 分为 {len(chunks)} 段")

    previous_note = ""

    for i, chunk in enumerate(chunks):
        print(f"[generate_chapter_note_stream] 处理第 {i + 1}/{len(chunks)} 段")

        if previous_note:
            prompt = f"""这是《{chapter_title}》章节前面部分的笔记：

{previous_note[-3000:]}

---

请继续整理以下内容，保持与前面笔记的风格和结构一致：

{chunk}"""
        else:
            prompt = prompt_template.format(
                chapter_title=chapter_title, original_text=chunk
            )

        # 收集当前段落的完整结果
        current_result = ""
        async for chunk_output in ai_service.generate_text_stream(
            prompt=prompt, system_prompt=system_prompt
        ):
            current_result += chunk_output
            yield chunk_output

        previous_note = current_result

        # 分段之间添加分隔符
        if i < len(chunks) - 1:
            yield "\n\n--- 继续处理下一部分 ---\n\n"


async def generate_structure(
    original_text: str, chapter_title: str = "未命名文档"
) -> dict:
    """
    第一阶段：分析全文，生成章节结构表（含行号）
    - 给原文加上行号前缀，让AI能精确定位每章的行号范围
    """
    text_len = len(original_text)
    print(f"[generate_structure] 文本: {text_len}字符")

    lines = original_text.split("\n")
    numbered_lines = [f"{i + 1}| {line}" for i, line in enumerate(lines)]
    numbered_text = "\n".join(numbered_lines)

    structure_system_prompt = settings_manager.structure_system_prompt
    structure_user_prompt_template = settings_manager.structure_user_prompt

    prompt = structure_user_prompt_template.format(
        chapter_title=chapter_title, numbered_text=numbered_text
    )

    raw_result = await ai_service.generate_text(
        prompt=prompt,
        system_prompt=structure_system_prompt,
        max_tokens=16384,
    )

    json_str = raw_result.strip()
    if json_str.startswith("```json"):
        json_str = json_str[7:]
    if json_str.startswith("```"):
        json_str = json_str[3:]
    if json_str.endswith("```"):
        json_str = json_str[:-3]
    json_str = json_str.strip()

    try:
        structure = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"[generate_structure] JSON解析失败: {e}")
        print(f"[generate_structure] 原始输出前200字: {raw_result[:200]}")
        brace_start = json_str.find("{")
        brace_end = json_str.rfind("}")
        if brace_start >= 0 and brace_end > brace_start:
            try:
                structure = json.loads(json_str[brace_start : brace_end + 1])
            except json.JSONDecodeError:
                raise ValueError(f"AI返回的结构表JSON格式错误，无法解析: {e}")
        else:
            raise ValueError(f"AI返回的结构表JSON格式错误，无法解析: {e}")

    if "chapters" not in structure:
        structure = {
            "book_title": chapter_title,
            "total_chapters": 1,
            "chapters": [
                {
                    "index": 0,
                    "title": chapter_title,
                    "summary": "全文",
                    "sections": [],
                }
            ],
        }

    print(f"[generate_structure] 成功提取结构: {structure.get('total_chapters', 0)}章")
    return structure


async def generate_section_note(
    section_text: str,
    section_info: dict,
    structure: dict,
    chapter_title: str = "未命名章节",
) -> str:
    """
    第二阶段：根据结构表和章节原文，填充该章节的详细内容
    - 复用用户可配置的 chapter_note_system_prompt
    - 添加上下文感知（全书结构表）
    """
    section_title = section_info.get("title", chapter_title)
    section_summary = section_info.get("summary", "")

    base_system_prompt = settings_manager.chapter_note_system_prompt
    context_addition = """

【重要：上下文感知】
你正在整理一本书的某个章节。下方提供了全书结构表和当前章节的结构信息。
请参考结构表来理解当前章节在全书中的位置和与其他章节的关系，
但只需要填充当前章节的内容，不要输出其他章节的内容。"""
    system_prompt = base_system_prompt + context_addition

    section_fill_prompt_template = settings_manager.section_fill_prompt

    structure_str = json.dumps(structure, ensure_ascii=False, indent=2)

    prompt = section_fill_prompt_template.format(
        structure=structure_str,
        section_title=section_title,
        section_summary=section_summary,
        section_text=section_text,
    )

    print(
        f"[generate_section_note] 填充章节: {section_title}, 原文: {len(section_text)}字符"
    )

    result = await ai_service.generate_text(
        prompt=prompt,
        system_prompt=system_prompt,
    )

    print(f"[generate_section_note] 完成: {section_title}, 输出: {len(result)}字符")
    return result


def split_text_by_structure(original_text: str, structure: dict) -> list[dict]:
    """
    根据结构表中的行号信息，将原文切分为各章节的文本
    如果没有行号，则通过章节标题匹配来定位
    """
    lines = original_text.split("\n")
    total_lines = len(lines)
    chapters = structure.get("chapters", [])
    result = []

    has_line_numbers = any(
        ch.get("start_line") is not None and ch.get("end_line") is not None
        for ch in chapters
    )

    if has_line_numbers:
        for ch in chapters:
            ch_index = ch.get("index", len(result))
            ch_title = ch.get("title", f"第{ch_index + 1}章")
            start_line = ch.get("start_line", 1)
            end_line = ch.get("end_line", total_lines)

            start = max(0, start_line - 1)
            end = min(total_lines, end_line)

            ch_text = "\n".join(lines[start:end]) if start < end else ""

            result.append(
                {
                    "index": ch_index,
                    "title": ch_title,
                    "text": ch_text,
                    "section_info": ch,
                }
            )
    else:
        chapter_positions = []
        for ch in chapters:
            ch_title = ch.get("title", "")
            clean_title = ch_title.strip().replace(" ", "").lower()
            best_line = -1
            for i, line in enumerate(lines):
                clean_line = line.strip().replace(" ", "").lower()
                if clean_title and clean_line and clean_title in clean_line:
                    best_line = i
                    break
            chapter_positions.append(best_line)

        for idx, ch in enumerate(chapters):
            ch_index = ch.get("index", idx)
            ch_title = ch.get("title", f"第{idx + 1}章")
            start_line = chapter_positions[idx]

            if start_line < 0:
                start_line = (
                    chapter_positions[idx - 1]
                    if idx > 0 and chapter_positions[idx - 1] >= 0
                    else 0
                )

            if idx < len(chapters) - 1:
                next_start = chapter_positions[idx + 1]
                if next_start < 0:
                    end_line = total_lines
                else:
                    end_line = next_start
            else:
                end_line = total_lines

            ch_text = (
                "\n".join(lines[start_line:end_line]) if start_line < end_line else ""
            )

            result.append(
                {
                    "index": ch_index,
                    "title": ch_title,
                    "text": ch_text,
                    "section_info": ch,
                }
            )

    if not result:
        result.append(
            {
                "index": 0,
                "title": structure.get("book_title", "全文"),
                "text": original_text,
                "section_info": {
                    "title": structure.get("book_title", "全文"),
                    "summary": "",
                },
            }
        )

    return result
