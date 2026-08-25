from __future__ import annotations

import asyncio
from contextvars import ContextVar, Token
from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from dotenv import load_dotenv
from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    OpenAIError,
    RateLimitError,
)


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

AI_REQUEST_TIMEOUT_SECONDS = 180.0
AI_RATE_LIMIT_RETRY_DELAYS_SECONDS = (2.0, 5.0, 10.0)
AI_SDK_MAX_RETRIES = 0
AI_ALLOW_EMPTY_KEY = os.getenv("AI_ALLOW_EMPTY_KEY", "false").lower() == "true"
AI_EMPTY_KEY_PLACEHOLDER = "dummy"
AI_SYSTEM_PROMPT = "Return only valid JSON matching the requested schema. No Markdown or explanation."
AI_JSON_REPAIR_PROMPT = (
    "你上一条响应无法解析为 JSON。请严格按照原始请求中指定的 JSON Schema 返回，"
    "只输出一个完整 JSON 对象，不要包含 Markdown 代码块、分析过程或任何其他内容。"
)
logger = logging.getLogger("uvicorn.error")

_ai_client: AsyncOpenAI | None = None
_ai_client_config: tuple[str, str] | None = None


@dataclass(frozen=True, slots=True)
class RequestAIConfig:
    api_key: str
    base_url: str


_request_ai_config: ContextVar[RequestAIConfig | None] = ContextVar(
    "request_ai_config",
    default=None,
)


class AIServiceError(RuntimeError):
    """Raised when the text model cannot return a usable JSON object."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "ai_generation_failed",
        status_code: int = 502,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def normalize_request_base_url(base_url: str) -> str:
    value = base_url.strip().rstrip("/")
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("AI baseUrl must be an absolute http:// or https:// URL")
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError("AI baseUrl must not contain query, fragment, or credentials")
    return value


def create_request_ai_config(api_key: str, base_url: str) -> RequestAIConfig:
    key = api_key.strip()
    if not key:
        raise ValueError("AI apiKey must not be empty")
    return RequestAIConfig(
        api_key=key,
        base_url=normalize_request_base_url(base_url),
    )


def set_request_ai_config(config: RequestAIConfig) -> Token:
    return _request_ai_config.set(config)


def reset_request_ai_config(token: Token) -> None:
    _request_ai_config.reset(token)


def get_request_ai_config() -> RequestAIConfig | None:
    return _request_ai_config.get()


def _create_ai_client(base_url: str, api_key: str) -> AsyncOpenAI:
    if not api_key and not AI_ALLOW_EMPTY_KEY:
        raise AIServiceError("AI_API_KEY is not configured")

    return AsyncOpenAI(
        api_key=api_key or AI_EMPTY_KEY_PLACEHOLDER,
        base_url=base_url,
        timeout=AI_REQUEST_TIMEOUT_SECONDS,
        max_retries=AI_SDK_MAX_RETRIES,
    )


def _get_ai_client(base_url: str, api_key: str) -> AsyncOpenAI:
    global _ai_client, _ai_client_config

    config = (base_url, api_key)
    if _ai_client is None or _ai_client_config != config:
        _ai_client = _create_ai_client(base_url, api_key)
        _ai_client_config = config
    return _ai_client


def log_ai_configuration() -> None:
    """Log non-sensitive AI configuration details when the API starts."""

    model = os.getenv("AI_MODEL", "").strip()
    base_url = os.getenv("AI_BASE_URL", "").strip().rstrip("/")
    has_api_key = bool(os.getenv("AI_API_KEY", "").strip())
    logger.info("当前模型：%s", model or "未配置")
    logger.info("接口地址：%s", base_url or "未配置")
    logger.info("是否配置Key：%s", "是" if has_api_key else "否")


async def close_ai_client() -> None:
    global _ai_client, _ai_client_config

    client = _ai_client
    _ai_client = None
    _ai_client_config = None
    if client is not None:
        await client.close()


def _parse_json_object(output_text: str) -> dict[str, Any]:
    """Parse pure JSON or extract the first complete JSON object from surrounding text."""

    text = output_text.lstrip("\ufeff").strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    else:
        if isinstance(parsed, dict):
            return parsed
        raise ValueError("Text model output must be a JSON object")

    decoder = json.JSONDecoder()
    for start, character in enumerate(text):
        if character != "{":
            continue
        try:
            candidate, _ = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(candidate, dict):
            return candidate

    raise json.JSONDecodeError("No complete JSON object found", text, 0)


async def _request_ai_output(
    client: AsyncOpenAI,
    model: str,
    base_url: str,
    messages: list[dict[str, str]],
    *,
    diagnostic_label: str | None = None,
) -> str:
    response = None
    for attempt in range(len(AI_RATE_LIMIT_RETRY_DELAYS_SECONDS) + 1):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
            )
            if attempt > 0:
                logger.info(
                    "[AI调用] 429重试后成功 model=%s base_url=%s attempts=%d",
                    model,
                    base_url,
                    attempt + 1,
                )
            break
        except RateLimitError as error:
            if attempt >= len(AI_RATE_LIMIT_RETRY_DELAYS_SECONDS):
                logger.error(
                    "[AI调用] 429重试耗尽 model=%s base_url=%s attempts=%d",
                    model,
                    base_url,
                    attempt + 1,
                    exc_info=True,
                )
                raise AIServiceError(
                    "AI服务暂时不可用，请稍后重试",
                    code="rate_limited",
                    status_code=503,
                ) from error

            delay = AI_RATE_LIMIT_RETRY_DELAYS_SECONDS[attempt]
            logger.warning(
                "[AI调用] 收到429，准备重试 model=%s base_url=%s retry=%d/%d wait_seconds=%s",
                model,
                base_url,
                attempt + 1,
                len(AI_RATE_LIMIT_RETRY_DELAYS_SECONDS),
                delay,
            )
            await asyncio.sleep(delay)
        except APITimeoutError as error:
            logger.error(
                "[AI调用] 请求超时 model=%s base_url=%s",
                model,
                base_url,
                exc_info=True,
            )
            raise AIServiceError(
                "AI 服务响应超时，请稍后重试。",
                code="timeout",
                status_code=504,
            ) from error
        except APIConnectionError as error:
            logger.error(
                "[AI调用] 连接失败 model=%s base_url=%s",
                model,
                base_url,
                exc_info=True,
            )
            raise AIServiceError(
                "AI服务暂时不可用，请稍后重试",
                code="connection_failed",
                status_code=503,
            ) from error
        except (OpenAIError, ValueError) as error:
            logger.error(
                "[AI调用] 调用失败 model=%s base_url=%s error_type=%s",
                model,
                base_url,
                type(error).__name__,
                exc_info=True,
            )
            raise AIServiceError("AI 生成失败，请稍后重试。") from error

    if response is None:
        raise AIServiceError("未获得AI响应", code="empty_response", status_code=502)

    if not response.choices:
        raise AIServiceError("AI response does not contain a choice")

    output_text = response.choices[0].message.content
    if not isinstance(output_text, str) or not output_text.strip():
        raise AIServiceError("AI response does not contain output text")
    if diagnostic_label:
        logger.info(
            "[%s] raw_ai_response=%s",
            diagnostic_label,
            output_text,
        )
    return output_text


async def _call_ai_with_client(
    client: AsyncOpenAI,
    model: str,
    base_url: str,
    prompt: str,
    *,
    diagnostic_label: str | None = None,
) -> dict[str, Any]:
    """Send one request through an already selected, isolated AI client."""

    messages = [
        {"role": "system", "content": AI_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    output_text = await _request_ai_output(
        client,
        model,
        base_url,
        messages,
        diagnostic_label=diagnostic_label,
    )

    try:
        parsed = _parse_json_object(output_text)
    except (json.JSONDecodeError, ValueError) as error:
        if diagnostic_label:
            logger.warning(
                "[%s] json_extract_parse_failed exception_type=%s exception_message=%s",
                diagnostic_label,
                type(error).__name__,
                str(error),
            )
        logger.warning("[AI调用] JSON解析失败，执行一次格式修复 model=%s", model)

    else:
        if diagnostic_label:
            logger.info(
                "[%s] json_extract_parse_succeeded parsed_top_level=%s",
                diagnostic_label,
                json.dumps(parsed, ensure_ascii=False, separators=(",", ":")),
            )
        return parsed

    repair_messages = [
        *messages,
        {"role": "assistant", "content": output_text},
        {"role": "user", "content": AI_JSON_REPAIR_PROMPT},
    ]
    repaired_output = await _request_ai_output(
        client,
        model,
        base_url,
        repair_messages,
        diagnostic_label=diagnostic_label,
    )
    try:
        parsed = _parse_json_object(repaired_output)
    except (json.JSONDecodeError, ValueError) as error:
        if diagnostic_label:
            logger.error(
                "[%s] repaired_json_extract_parse_failed exception_type=%s exception_message=%s",
                diagnostic_label,
                type(error).__name__,
                str(error),
                exc_info=True,
            )
        raise AIServiceError(
            "AI 返回格式错误，请稍后重试。",
            code="invalid_json",
            status_code=502,
        ) from error
    if diagnostic_label:
        logger.info(
            "[%s] repaired_json_extract_parse_succeeded parsed_top_level=%s",
            diagnostic_label,
            json.dumps(parsed, ensure_ascii=False, separators=(",", ":")),
        )
    return parsed


async def call_ai(
    prompt: str,
    *,
    diagnostic_label: str | None = None,
) -> dict[str, Any]:
    """Call AI with request-level credentials or the configured backend fallback."""

    model = os.getenv("AI_MODEL", "").strip()
    request_config = get_request_ai_config()
    if request_config is not None:
        base_url = request_config.base_url
        api_key = request_config.api_key
        if not model:
            raise AIServiceError("AI_MODEL is not configured")

        client = _create_ai_client(base_url, api_key)
        try:
            return await _call_ai_with_client(
                client,
                model,
                base_url,
                prompt,
                diagnostic_label=diagnostic_label,
            )
        finally:
            await client.close()

    base_url = os.getenv("AI_BASE_URL", "").strip().rstrip("/")
    api_key = os.getenv("AI_API_KEY", "").strip()

    if not base_url:
        raise AIServiceError("AI_BASE_URL is not configured")
    if not api_key and not AI_ALLOW_EMPTY_KEY:
        raise AIServiceError("AI_API_KEY is not configured")
    if not model:
        raise AIServiceError("AI_MODEL is not configured")

    return await _call_ai_with_client(
        _get_ai_client(base_url, api_key),
        model,
        base_url,
        prompt,
        diagnostic_label=diagnostic_label,
    )
