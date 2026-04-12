from openai import AsyncOpenAI
from app.config import settings_manager
from app.services.document_processor import DocumentProcessor
from typing import Optional, AsyncGenerator
import asyncio
import traceback
import httpx


def normalize_base_url(url: str) -> str:
    if not url:
        return url
    url = url.rstrip("/")
    if url.endswith("/v1"):
        return url
    if not url.endswith("/v1"):
        url = url + "/v1"
    return url


async def retry_async(func, max_retries=5, base_delay=3, timeout=300):
    last_error = None
    for attempt in range(max_retries):
        try:
            return await asyncio.wait_for(func(), timeout=timeout)
        except asyncio.TimeoutError:
            last_error = TimeoutError(
                f"请求超时（{timeout}秒）。可能原因：模型响应慢、网络问题、或内容过长。"
            )
            print(
                f"[retry_async] Attempt {attempt + 1}/{max_retries} timed out after {timeout}s"
            )

            if attempt < max_retries - 1:
                wait_time = base_delay * (2**attempt)
                print(f"[retry_async] Waiting {wait_time}s before retry...")
                await asyncio.sleep(wait_time)
                continue
            raise last_error
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            error_type = type(e).__name__
            print(
                f"[retry_async] Attempt {attempt + 1}/{max_retries} failed: {error_type}: {str(e)}"
            )

            is_retryable = any(
                code in error_str
                for code in [
                    "503",
                    "overloaded",
                    "memory",
                    "rate limit",
                    "500",
                    "internal error",
                    "timeout",
                    "connection",
                    "timed out",
                    "429",
                    "too many requests",
                    "service unavailable",
                    "bad gateway",
                    "gateway timeout",
                    "502",
                    "504",
                    "network",
                    "socket",
                    "eof",
                    "reset",
                    "broken pipe",
                ]
            )

            if is_retryable and attempt < max_retries - 1:
                wait_time = base_delay * (2**attempt)
                print(
                    f"[retry_async] Retryable error detected. Waiting {wait_time}s before retry..."
                )
                await asyncio.sleep(wait_time)
                continue

            if (
                "api key" in error_str
                or "authentication" in error_str
                or "unauthorized" in error_str
            ):
                raise ValueError(
                    f"API认证失败：请检查API Key是否正确。错误详情：{str(e)}"
                )
            elif "model" in error_str and (
                "not found" in error_str or "does not exist" in error_str
            ):
                raise ValueError(
                    f"模型不存在：请检查模型名称 '{settings_manager.model_name}' 是否正确。错误详情：{str(e)}"
                )
            elif "context" in error_str and "length" in error_str:
                raise ValueError(
                    f"内容过长：输入内容超出模型上下文限制。请尝试缩短内容或使用支持更长上下文的模型。"
                )

            raise e
    if last_error:
        raise last_error
    return None


class AIService:
    def __init__(self):
        self._last_error = None
        self.client = None
        self.model = None
        self._api_key_valid = False
        self._last_config = None
        try:
            self.update_client()
        except ValueError as e:
            print(f"[AIService] Warning: {e}")
            self._last_error = str(e)

    def update_client(self):
        base_url = normalize_base_url(settings_manager.openai_api_base)
        api_key = settings_manager.openai_api_key
        current_config = (base_url, api_key, settings_manager.model_name)

        if self._last_config == current_config and self.client:
            return

        if not api_key or not api_key.strip():
            self._api_key_valid = False
            self._last_error = "API Key 未设置！请在设置中配置有效的 API Key"
            raise ValueError(self._last_error)

        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=httpx.Timeout(300.0, connect=60.0),
        )
        self.model = settings_manager.model_name
        self._last_config = current_config
        self._last_error = None
        self._api_key_valid = True

    def _check_client(self):
        if not self._api_key_valid or not self.client:
            raise ValueError(f"API配置无效：{self._last_error or '请检查API设置'}")

    async def generate_framework(self, content: str) -> str:
        self._check_client()
        self.update_client()

        prompt_template = settings_manager.framework_prompt
        prompt = prompt_template.replace("{content}", content)

        print(f"[generate_framework] Prompt length: {len(prompt)}")

        async def _call_api():
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": """你是一个专业的文档分析助手，擅长：
1. 提取文章的结构和脉络
2. 从原文中准确提取专业术语、技术名词、核心概念
3. 保持术语的准确性，使用原文中的准确词汇

你的输出必须：
- 术语必须来自原文，不能自己编造
- 结构要清晰，便于理解
- 术语罗列要全面""",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            return response

        try:
            response = await retry_async(_call_api, max_retries=3, base_delay=2)
            if response and hasattr(response, "choices") and response.choices:
                return response.choices[0].message.content
            else:
                raise ValueError(f"API响应格式异常: {type(response)}")
        except Exception as e:
            print(f"generate_framework error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise

    async def explain_highlight(
        self,
        highlighted_text: str,
        full_content: str,
        custom_prompt: Optional[str] = None,
    ) -> str:
        self._check_client()
        self.update_client()
        context = DocumentProcessor.get_context_around_text(
            full_content, highlighted_text
        )

        if custom_prompt:
            prompt = custom_prompt.replace("{highlighted_text}", highlighted_text)
            prompt = prompt.replace("{keyword}", highlighted_text)
            prompt = prompt.replace("{context}", context)
        else:
            prompt = settings_manager.explain_prompt.replace(
                "{keyword}", highlighted_text
            )
            prompt = prompt.replace("{context}", context)

        print(f"[explain_highlight] Prompt length: {len(prompt)}")

        async def _call_api():
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的知识解释助手，擅长用清晰易懂的方式解释复杂概念。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
            )
            return response

        try:
            response = await retry_async(_call_api, max_retries=3, base_delay=2)
            if response and hasattr(response, "choices") and response.choices:
                return response.choices[0].message.content
            else:
                raise ValueError(f"API响应格式异常: {type(response)}")
        except Exception as e:
            print(f"explain_highlight error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise

    async def optimize_paragraph(self, paragraph: str) -> str:
        self._check_client()
        self.update_client()

        print(f"[optimize_paragraph] API Base URL: {self.client.base_url}")
        print(f"[optimize_paragraph] Model: {self.model}")
        print(f"[optimize_paragraph] Paragraph length: {len(paragraph)}")

        prompt_template = settings_manager.optimize_prompt
        if not prompt_template:
            prompt_template = (
                "请优化以下段落，将其转换为书面化表达并删除重复性内容：\n\n{paragraph}"
            )
        prompt = prompt_template.replace("{paragraph}", paragraph)

        async def _call_api():
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的文本编辑助手，擅长将口语化表达转换为书面化表达，并删除重复性内容。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            return response

        try:
            response = await retry_async(_call_api, max_retries=3, base_delay=2)

            if response and hasattr(response, "choices") and response.choices:
                return response.choices[0].message.content
            else:
                raise ValueError(f"API响应格式异常: {type(response)}")
        except Exception as e:
            print(f"optimize_paragraph error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise

    async def optimize_paragraph_stream(
        self, paragraph: str
    ) -> AsyncGenerator[str, None]:
        self._check_client()
        self.update_client()

        print(f"[optimize_paragraph_stream] API Base URL: {self.client.base_url}")
        print(f"[optimize_paragraph_stream] Model: {self.model}")
        print(f"[optimize_paragraph_stream] Paragraph length: {len(paragraph)}")

        prompt_template = settings_manager.optimize_prompt
        if not prompt_template:
            prompt_template = (
                "请优化以下段落，将其转换为书面化表达并删除重复性内容：\n\n{paragraph}"
            )
        prompt = prompt_template.replace("{paragraph}", paragraph)

        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的文本编辑助手，擅长将口语化表达转换为书面化表达，并删除重复性内容。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield delta.content

        except Exception as e:
            error_str = str(e).lower()
            print(f"optimize_paragraph_stream error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()

            if (
                "api key" in error_str
                or "authentication" in error_str
                or "unauthorized" in error_str
            ):
                raise ValueError(
                    f"API认证失败：请检查API Key是否正确。错误详情：{str(e)}"
                )
            elif "model" in error_str and (
                "not found" in error_str or "does not exist" in error_str
            ):
                raise ValueError(
                    f"模型不存在：请检查模型名称 '{settings_manager.model_name}' 是否正确。错误详情：{str(e)}"
                )
            elif "context" in error_str and "length" in error_str:
                raise ValueError(f"内容过长：输入内容超出模型上下文限制。")

            raise

    async def generate_text(self, prompt: str, system_prompt: str = None) -> str:
        self._check_client()
        self.update_client()

        print(f"[generate_text] API Base URL: {self.client.base_url}")
        print(f"[generate_text] Model: {self.model}")
        print(f"[generate_text] Prompt length: {len(prompt)}")

        MAX_PROMPT_LENGTH = 30000
        if len(prompt) > MAX_PROMPT_LENGTH:
            print(
                f"[generate_text] WARNING: Prompt length ({len(prompt)}) exceeds recommended limit ({MAX_PROMPT_LENGTH})"
            )
            print(f"[generate_text] This may cause timeout or context length errors")

        async def _call_api():
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                        or "你是一个专业的写作助手，擅长生成结构清晰、逻辑连贯的文章。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
            )
            return response

        try:
            response = await retry_async(_call_api, max_retries=3, base_delay=2)

            if response and hasattr(response, "choices") and response.choices:
                return response.choices[0].message.content
            else:
                raise ValueError(f"API响应格式异常: {type(response)}")
        except Exception as e:
            print(f"generate_text error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise

    async def generate_text_stream(
        self, prompt: str, system_prompt: str = None
    ) -> AsyncGenerator[str, None]:
        self._check_client()
        self.update_client()

        print(f"[generate_text_stream] API Base URL: {self.client.base_url}")
        print(f"[generate_text_stream] Model: {self.model}")
        print(f"[generate_text_stream] Prompt length: {len(prompt)}")

        MAX_PROMPT_LENGTH = 30000
        if len(prompt) > MAX_PROMPT_LENGTH:
            print(
                f"[generate_text_stream] WARNING: Prompt length ({len(prompt)}) exceeds recommended limit ({MAX_PROMPT_LENGTH})"
            )

        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                        or "你是一个专业的写作助手，擅长生成结构清晰、逻辑连贯的文章。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield delta.content

        except Exception as e:
            error_str = str(e).lower()
            print(f"generate_text_stream error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()

            if (
                "api key" in error_str
                or "authentication" in error_str
                or "unauthorized" in error_str
            ):
                raise ValueError(
                    f"API认证失败：请检查API Key是否正确。错误详情：{str(e)}"
                )
            elif "model" in error_str and (
                "not found" in error_str or "does not exist" in error_str
            ):
                raise ValueError(
                    f"模型不存在：请检查模型名称 '{settings_manager.model_name}' 是否正确。错误详情：{str(e)}"
                )
            elif "context" in error_str and "length" in error_str:
                raise ValueError(
                    f"内容过长：输入内容超出模型上下文限制。请尝试缩短内容或使用支持更长上下文的模型。"
                )

            raise

    async def generate_timeline_notes(
        self, content: str, custom_prompt: Optional[str] = None
    ) -> str:
        """
        从文档内容中提取时间事件并生成规范化格式的时间笔记

        格式规范：
        - 单个事件：[YYYY-MM-DD/事件标题/简短内容解释]
        - 多个事件：{[时间1/内容1], [时间2/内容2], [时间3/内容3]}
        - 时间可以是年份、年月或年月日
        """
        self._check_client()
        self.update_client()

        # 从config读取提示词
        default_prompt = settings_manager.timeline_prompt
        prompt = (custom_prompt or default_prompt).replace("{content}", content[:15000])

        print(f"[generate_timeline_notes] Content length: {len(content)}")
        print(f"[generate_timeline_notes] Prompt length: {len(prompt)}")

        async def _call_api():
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的历史文献分析助手，擅长从文档中提取时间事件并按规范格式输出。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            return response

        try:
            response = await retry_async(_call_api, max_retries=3, base_delay=2)
            if response and hasattr(response, "choices") and response.choices:
                return response.choices[0].message.content
            else:
                raise ValueError(f"API响应格式异常: {type(response)}")
        except Exception as e:
            print(f"generate_timeline_notes error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise

    async def generate_timeline_notes_stream(
        self, content: str, custom_prompt: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        流式生成时间笔记
        """
        self._check_client()
        self.update_client()

        # 从config读取提示词
        default_prompt = settings_manager.timeline_prompt
        prompt = (custom_prompt or default_prompt).replace("{content}", content[:15000])

        print(f"[generate_timeline_notes_stream] Content length: {len(content)}")

        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的历史文献分析助手，擅长从文档中提取时间事件并按规范格式输出。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield delta.content

        except Exception as e:
            error_str = str(e).lower()
            print(f"generate_timeline_notes_stream error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()

            if (
                "api key" in error_str
                or "authentication" in error_str
                or "unauthorized" in error_str
            ):
                raise ValueError(
                    f"API认证失败：请检查API Key是否正确。错误详情：{str(e)}"
                )
            elif "model" in error_str and (
                "not found" in error_str or "does not exist" in error_str
            ):
                raise ValueError(
                    f"模型不存在：请检查模型名称 '{settings_manager.model_name}' 是否正确。错误详情：{str(e)}"
                )
            elif "context" in error_str and "length" in error_str:
                raise ValueError(f"内容过长：输入内容超出模型上下文限制。")

            raise

    async def polish_note(self, note_content: str) -> str:
        """
        润色笔记内容，将口语化表达转换为书面化表达
        保持内容大意不变，优化表达方式
        """
        self._check_client()
        self.update_client()

        print(f"[polish_note] API Base URL: {self.client.base_url}")
        print(f"[polish_note] Model: {self.model}")
        print(f"[polish_note] Note content length: {len(note_content)}")

        prompt = f"""请润色以下笔记内容，要求：

1. 将口语化表达转换为更规范的书面化表达
2. 保持原有内容和意思不变
3. 删除重复性内容
4. 优化句子结构，使其更加通顺流畅
5. 保留关键信息和重要细节
6. 不要添加原文中没有的内容

笔记内容：
{note_content}

请直接输出润色后的内容，不要添加任何解释说明。"""

        async def _call_api():
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的笔记编辑助手，擅长将口语化的笔记内容转换为清晰、规范的书面化表达，同时保持内容的完整性和准确性。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            return response

        try:
            response = await retry_async(_call_api, max_retries=3, base_delay=2)

            if response and hasattr(response, "choices") and response.choices:
                return response.choices[0].message.content
            else:
                raise ValueError(f"API响应格式异常: {type(response)}")
        except Exception as e:
            print(f"polish_note error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise

    async def generate_note(self, note_content: str) -> dict:
        """
        一键生成笔记标题和内容
        根据用户输入的内容，生成规范的笔记标题和润色后的内容
        """
        self._check_client()
        self.update_client()

        print(f"[generate_note] API Base URL: {self.client.base_url}")
        print(f"[generate_note] Model: {self.model}")
        print(f"[generate_note] Note content length: {len(note_content)}")

        prompt = f"""请根据以下笔记内容，生成一个规范的笔记标题和润色后的内容。

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

        async def _call_api():
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的笔记编辑助手，擅长根据用户输入的内容生成规范的笔记标题和润色后的内容。你必须严格按照JSON格式输出。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            )
            return response

        try:
            response = await retry_async(_call_api, max_retries=3, base_delay=2)

            if response and hasattr(response, "choices") and response.choices:
                result_text = response.choices[0].message.content

                # 尝试解析JSON
                import json

                try:
                    # 提取JSON部分（去除可能的markdown代码块标记）
                    json_text = result_text
                    if "```json" in json_text:
                        json_text = (
                            json_text.split("```json")[1].split("```")[0].strip()
                        )
                    elif "```" in json_text:
                        json_text = json_text.split("```")[1].split("```")[0].strip()

                    result = json.loads(json_text)
                    return {
                        "title": result.get("title", ""),
                        "content": result.get("content", ""),
                    }
                except json.JSONDecodeError:
                    # 如果JSON解析失败，尝试从文本中提取标题和内容
                    lines = result_text.split("\n")
                    title = ""
                    content = ""

                    for line in lines:
                        if "标题" in line or "title" in line.lower():
                            title = line.split(":", 1)[-1].strip().strip('"')
                        elif "内容" in line or "content" in line.lower():
                            content = line.split(":", 1)[-1].strip().strip('"')

                    if not title or not content:
                        # 如果还是提取失败，返回原始内容
                        return {"title": "笔记", "content": result_text}

                    return {"title": title, "content": content}
            else:
                raise ValueError(f"API响应格式异常: {type(response)}")
        except Exception as e:
            print(f"generate_note error: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise


ai_service = AIService()
