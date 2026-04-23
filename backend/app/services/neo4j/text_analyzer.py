import json
import logging
from string import Template
from typing import List, Dict, Any

from openai import OpenAI

from app.config import settings_manager

logger = logging.getLogger(__name__)


class PhilosophyTextAnalyzer:
    def __init__(self):
        self.api_key = settings_manager.openai_api_key
        self.base_url = settings_manager.openai_api_base
        self.model = settings_manager.model_name

        if not self.api_key:
            raise ValueError("必须提供 OpenAI API 密钥")

        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def analyze_text(self, text: str, chunk_size: int = 4000, overlap: int = 500) -> Dict[str, Any]:
        logger.info(f"开始分析文本，长度: {len(text)}")

        chunks = self._split_text(text, chunk_size, overlap)
        logger.info(f"文本已分割为 {len(chunks)} 个块")

        all_entities = {
            "philosophers": [],
            "concepts": [],
            "theories": [],
            "works": [],
            "arguments": [],
            "schools": [],
            "eras": [],
        }
        all_relations = []

        for i, chunk in enumerate(chunks):
            logger.info(f"分析第 {i + 1}/{len(chunks)} 个文本块")
            entities_data = self._extract_entities(chunk)
            relations_data = self._extract_relations(chunk, entities_data)

            for key in all_entities:
                all_entities[key].extend(entities_data.get(key, []))
            all_relations.extend(relations_data)

        logger.info(
            f"分析完成，共提取 {sum(len(v) for v in all_entities.values())} 个实体，{len(all_relations)} 个关系"
        )

        return {**all_entities, "relations": all_relations}

    def _split_text(self, text: str, chunk_size: int, overlap: int) -> List[str]:
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            if end < len(text):
                for i in range(end, start + chunk_size // 2, -1):
                    if i < len(text) and text[i] in ".。!?！？\n":
                        end = i + 1
                        break
            chunks.append(text[start:end].strip())
            if end >= len(text):
                break
            start = end - overlap
        return chunks

    def _extract_entities(self, text: str) -> Dict[str, Any]:
        extraction_prompt = settings_manager.kg_extraction_prompt
        prompt = Template(extraction_prompt).substitute(text=text)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是一个专业的哲学文本分析助手。请只返回 JSON 格式的结果，不要添加其他说明文字。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=4000,
            )
            content = response.choices[0].message.content
            json_str = self._extract_json(content)
            data = json.loads(json_str)
            return data
        except Exception as e:
            logger.error(f"提取实体失败: {e}")
            return {
                "philosophers": [], "concepts": [], "theories": [],
                "works": [], "arguments": [], "schools": [], "eras": [],
            }

    def _extract_relations(self, text: str, entities_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        entities_list = []
        for category, items in entities_data.items():
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict) and "name" in item:
                        entities_list.append(f"- {item['name']} ({category[:-1]})")

        entities_str = "\n".join(entities_list)
        relation_prompt = settings_manager.kg_relation_prompt
        prompt = Template(relation_prompt).substitute(entities=entities_str, text=text)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是一个专业的哲学文本分析助手。请只返回 JSON 格式的结果，不要添加其他说明文字。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=3000,
            )
            content = response.choices[0].message.content
            json_str = self._extract_json(content)
            data = json.loads(json_str)
            return data.get("relations", [])
        except Exception as e:
            logger.error(f"提取关系失败: {e}")
            return []

    def _extract_json(self, content: str) -> str:
        if "```json" in content:
            start = content.find("```json") + 7
            end = content.find("```", start)
            return content[start:end].strip()
        elif "```" in content:
            start = content.find("```") + 3
            end = content.find("```", start)
            return content[start:end].strip()
        else:
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1:
                return content[start : end + 1]
            return content
