import re
from typing import List, Tuple


class DocumentProcessor:
    DEFAULT_PROMPT_TEMPLATE = """请详细解释以下内容：

"{highlighted_text}"

上下文信息：
{context}

请用清晰易懂的方式解释上述内容，包括：
1. 核心概念的定义
2. 相关背景知识
3. 实际应用场景或示例
4. 与其他概念的联系（如适用）
"""

    @staticmethod
    def generate_framework(content: str) -> str:
        sections = DocumentProcessor._extract_sections(content)
        framework_lines = []
        framework_lines.append("# 文章框架\n")

        for i, (title, level) in enumerate(sections):
            indent = "  " * (level - 1)
            framework_lines.append(f"{indent}- {title}")

        concepts = DocumentProcessor._extract_key_concepts(content)
        if concepts:
            framework_lines.append("\n## 关键概念\n")
            for concept in concepts[:10]:
                framework_lines.append(f"- {concept}")

        return "\n".join(framework_lines)

    @staticmethod
    def _extract_sections(content: str) -> list[tuple[str, int]]:
        sections = []
        lines = content.split("\n")

        for line in lines:
            heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            if heading_match:
                level = len(heading_match.group(1))
                title = heading_match.group(2).strip()
                sections.append((title, level))

        return sections

    @staticmethod
    def _extract_key_concepts(content: str) -> list[str]:
        concepts = []

        patterns = [
            r'【(.+?)】',
            r'「(.+?)」',
            r'"(.+?)"',
            r'\*\*(.+?)\*\*',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, content)
            concepts.extend(matches)

        concept_keywords = [
            "概念", "定义", "原理", "方法", "技术", "理论",
            "模型", "算法", "框架", "系统", "机制"
        ]

        for keyword in concept_keywords:
            pattern = rf'(\S+{keyword})'
            matches = re.findall(pattern, content)
            concepts.extend(matches)

        unique_concepts = list(dict.fromkeys(concepts))
        return unique_concepts

    @staticmethod
    def insert_highlight_links(content: str, highlights: list[dict]) -> str:
        if not highlights:
            return content

        sorted_highlights = sorted(highlights, key=lambda x: x['start_offset'], reverse=True)

        result = content
        for h in sorted_highlights:
            start = h['start_offset']
            end = h['end_offset']
            highlight_id = h['id']

            if start < len(result) and end <= len(result):
                original_text = result[start:end]
                linked_text = f'[{original_text}](#highlight-{highlight_id})'
                result = result[:start] + linked_text + result[end:]

        return result

    @staticmethod
    def get_context_around_text(full_content: str, target_text: str, context_chars: int = 500) -> str:
        try:
            start_idx = full_content.find(target_text)
            if start_idx == -1:
                return full_content[:context_chars * 2]

            context_start = max(0, start_idx - context_chars)
            context_end = min(len(full_content), start_idx + len(target_text) + context_chars)

            context = full_content[context_start:context_end]

            if context_start > 0:
                context = "..." + context
            if context_end < len(full_content):
                context = context + "..."

            return context
        except Exception:
            return full_content[:context_chars * 2]
