from __future__ import annotations

import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, call, patch

import httpx
from openai import RateLimitError

from backend.services.ai_service import (
    AIServiceError,
    _create_ai_client,
    call_ai,
    close_ai_client,
    log_ai_configuration,
)


class FakeCompletions:
    def __init__(self, content: str) -> None:
        self.content = content
        self.last_request: dict[str, object] = {}

    async def create(self, **kwargs: object) -> SimpleNamespace:
        self.last_request = kwargs
        return SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(content=self.content))
            ]
        )


class SequencedCompletions(FakeCompletions):
    def __init__(self, contents: list[str]) -> None:
        super().__init__(contents[-1])
        self.contents = iter(contents)
        self.call_count = 0

    async def create(self, **kwargs: object) -> SimpleNamespace:
        self.call_count += 1
        self.last_request = kwargs
        return SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(content=next(self.contents)))
            ]
        )


def make_rate_limit_error() -> RateLimitError:
    request = httpx.Request("POST", "https://ai.example.test/v1/chat/completions")
    response = httpx.Response(429, request=request)
    return RateLimitError("rate limited", response=response, body={})


class RateLimitedCompletions(FakeCompletions):
    def __init__(self, content: str, failures: int) -> None:
        super().__init__(content)
        self.failures = failures
        self.call_count = 0

    async def create(self, **kwargs: object) -> SimpleNamespace:
        self.call_count += 1
        if self.call_count <= self.failures:
            raise make_rate_limit_error()
        return await super().create(**kwargs)


class FakeAsyncOpenAI:
    def __init__(self, content: str) -> None:
        self.completions = FakeCompletions(content)
        self.chat = SimpleNamespace(completions=self.completions)

        self.close_count = 0

    async def close(self) -> None:
        self.close_count += 1


class AIServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        await close_ai_client()

    async def asyncTearDown(self) -> None:
        await close_ai_client()

    async def test_call_ai_uses_compatible_sdk_config_and_parses_json(self) -> None:
        expected = {"scripts": [{"id": "script-1"}]}
        fake_client = FakeAsyncOpenAI(json.dumps(expected))

        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1/",
                    "AI_API_KEY": "test-key",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            patch(
                "backend.services.ai_service.AsyncOpenAI",
                return_value=fake_client,
            ) as mocked_client,
        ):
            result = await call_ai("生成脚本")
            second_result = await call_ai("再次生成脚本")

        self.assertEqual(result, expected)
        self.assertEqual(second_result, expected)
        mocked_client.assert_called_once_with(
            api_key="test-key",
            base_url="https://ai.example.test/v1",
            timeout=180.0,
            max_retries=0,
        )
        request_body = fake_client.completions.last_request
        self.assertEqual(request_body["model"], "test-model")
        self.assertEqual(request_body["response_format"], {"type": "json_object"})
        self.assertEqual(
            request_body["messages"][-1],
            {"role": "user", "content": "再次生成脚本"},
        )

    async def test_call_ai_retries_429_with_configured_backoff(self) -> None:
        expected = {"creatives": [{"id": "creative-1"}]}
        fake_client = FakeAsyncOpenAI(json.dumps(expected))
        fake_client.completions = RateLimitedCompletions(
            json.dumps(expected), failures=3
        )
        fake_client.chat = SimpleNamespace(completions=fake_client.completions)

        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1",
                    "AI_API_KEY": "test-key",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            patch(
                "backend.services.ai_service.AsyncOpenAI",
                return_value=fake_client,
            ),
            patch(
                "backend.services.ai_service.asyncio.sleep",
                new_callable=AsyncMock,
            ) as mocked_sleep,
        ):
            result = await call_ai("生成创意")

        self.assertEqual(result, expected)
        self.assertEqual(fake_client.completions.call_count, 4)
        self.assertEqual(
            mocked_sleep.await_args_list,
            [call(2.0), call(5.0), call(10.0)],
        )

    async def test_call_ai_returns_503_after_429_retries_are_exhausted(self) -> None:
        fake_client = FakeAsyncOpenAI("{}")
        fake_client.completions = RateLimitedCompletions("{}", failures=4)
        fake_client.chat = SimpleNamespace(completions=fake_client.completions)

        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1",
                    "AI_API_KEY": "test-key",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            patch(
                "backend.services.ai_service.AsyncOpenAI",
                return_value=fake_client,
            ),
            patch(
                "backend.services.ai_service.asyncio.sleep",
                new_callable=AsyncMock,
            ) as mocked_sleep,
        ):
            with self.assertRaises(AIServiceError) as raised:
                await call_ai("生成创意")

        self.assertEqual(fake_client.completions.call_count, 4)
        self.assertEqual(mocked_sleep.await_count, 3)
        self.assertEqual(raised.exception.code, "rate_limited")
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(str(raised.exception), "AI服务暂时不可用，请稍后重试")

    def test_log_ai_configuration_excludes_key_value(self) -> None:
        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1/",
                    "AI_API_KEY": "super-secret-key",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            self.assertLogs("uvicorn.error", level="INFO") as captured,
        ):
            log_ai_configuration()

        output = "\n".join(captured.output)
        self.assertIn("当前模型：test-model", output)
        self.assertIn("接口地址：https://ai.example.test/v1", output)
        self.assertIn("是否配置Key：是", output)
        self.assertNotIn("super-secret-key", output)

    async def test_call_ai_rejects_invalid_json_output(self) -> None:
        fake_client = FakeAsyncOpenAI("not-json")

        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1",
                    "AI_API_KEY": "test-key",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            patch(
                "backend.services.ai_service.AsyncOpenAI",
                return_value=fake_client,
            ),
        ):
            with self.assertRaises(AIServiceError) as raised:
                await call_ai("生成创意")

        self.assertEqual(raised.exception.code, "invalid_json")
        self.assertEqual(str(raised.exception), "AI 返回格式错误，请稍后重试。")

    async def test_call_ai_extracts_json_from_code_fence_and_surrounding_text(self) -> None:
        expected = {"hotspots": [{"index": 0, "relevance": 80}]}
        fake_client = FakeAsyncOpenAI(
            f"以下是结果：\n```json\n{json.dumps(expected)}\n```\n请查收。"
        )

        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1",
                    "AI_API_KEY": "test-key",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            patch(
                "backend.services.ai_service.AsyncOpenAI",
                return_value=fake_client,
            ),
        ):
            result = await call_ai("筛选热点")

        self.assertEqual(result, expected)

    async def test_call_ai_repairs_invalid_json_once(self) -> None:
        expected = {"hotspots": [{"index": 0, "relevance": 80}]}
        fake_client = FakeAsyncOpenAI("unused")
        completions = SequencedCompletions(["not-json", json.dumps(expected)])
        fake_client.completions = completions
        fake_client.chat = SimpleNamespace(completions=completions)

        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1",
                    "AI_API_KEY": "test-key",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            patch(
                "backend.services.ai_service.AsyncOpenAI",
                return_value=fake_client,
            ),
        ):
            result = await call_ai("筛选热点")

        self.assertEqual(result, expected)
        self.assertEqual(completions.call_count, 2)
        messages = completions.last_request["messages"]
        self.assertEqual(messages[-2], {"role": "assistant", "content": "not-json"})
        self.assertIn("只输出一个完整 JSON 对象", messages[-1]["content"])

    async def test_call_ai_requires_base_url_without_official_fallback(self) -> None:
        with patch.dict(
            os.environ,
            {"AI_API_KEY": "test-key", "AI_MODEL": "test-model"},
            clear=True,
        ):
            with self.assertRaisesRegex(AIServiceError, "AI_BASE_URL"):
                await call_ai("生成创意")

    async def test_call_ai_requires_api_key(self) -> None:
        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "https://ai.example.test/v1",
                    "AI_ALLOW_EMPTY_KEY": "false",
                    "AI_MODEL": "test-model",
                },
                clear=True,
            ),
            patch("backend.services.ai_service.AI_ALLOW_EMPTY_KEY", False),
        ):
            with self.assertRaisesRegex(AIServiceError, "AI_API_KEY"):
                await call_ai("生成创意")

    async def test_call_ai_allows_empty_api_key_when_enabled(self) -> None:
        expected = {"scripts": [{"id": "local-script-1"}]}
        fake_client = FakeAsyncOpenAI(json.dumps(expected))

        with (
            patch.dict(
                os.environ,
                {
                    "AI_BASE_URL": "http://localhost:1234/v1",
                    "AI_ALLOW_EMPTY_KEY": "true",
                    "AI_MODEL": "local-model",
                },
                clear=True,
            ),
            patch("backend.services.ai_service.AI_ALLOW_EMPTY_KEY", True),
            patch(
                "backend.services.ai_service.AsyncOpenAI",
                return_value=fake_client,
            ) as mocked_client,
        ):
            result = await call_ai("生成本地脚本")

        self.assertEqual(result, expected)
        mocked_client.assert_called_once_with(
            api_key="dummy",
            base_url="http://localhost:1234/v1",
            timeout=180.0,
            max_retries=0,
        )

    async def test_create_ai_client_with_empty_key_uses_sdk_placeholder(self) -> None:
        with patch("backend.services.ai_service.AI_ALLOW_EMPTY_KEY", True):
            client = _create_ai_client("http://localhost:1234/v1", "")

        try:
            self.assertEqual(client.api_key, "dummy")
        finally:
            await client.close()

    async def test_call_ai_requires_model(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_BASE_URL": "https://ai.example.test/v1",
                "AI_API_KEY": "test-key",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(AIServiceError, "AI_MODEL"):
                await call_ai("生成创意")


if __name__ == "__main__":
    unittest.main()
