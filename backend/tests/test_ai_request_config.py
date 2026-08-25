from __future__ import annotations

import asyncio
import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx

from backend.main import app
from backend.services.ai_service import (
    call_ai,
    create_request_ai_config,
    get_request_ai_config,
    reset_request_ai_config,
    set_request_ai_config,
)


class FakeCompletions:
    def __init__(self, api_key: str, content: str | None = None) -> None:
        self.api_key = api_key
        self.content = content

    async def create(self, **kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=self.content or json.dumps({"key": self.api_key})
                    )
                )
            ]
        )


class FakeClient:
    def __init__(self, api_key: str, content: str | None = None) -> None:
        self.completions = FakeCompletions(api_key, content)
        self.chat = SimpleNamespace(completions=self.completions)
        self.close_count = 0

    async def close(self) -> None:
        self.close_count += 1


def creative_request() -> dict[str, object]:
    return {
        "hotspot": {
            "title": "test hotspot",
            "summary": "test summary",
            "platform": "微博",
            "rank": 1,
            "hotScore": 100,
        },
        "interests": ["test interest"],
    }


class AIRequestConfigTests(unittest.IsolatedAsyncioTestCase):
    async def test_call_ai_uses_request_config_and_keeps_env_unchanged(self) -> None:
        created_clients: dict[str, FakeClient] = {}

        def make_client(*, api_key: str, base_url: str, **_: object) -> FakeClient:
            client = FakeClient(api_key)
            created_clients[api_key] = client
            return client

        with (
            patch.dict(
                os.environ,
                {
                    "AI_API_KEY": "env-key",
                    "AI_BASE_URL": "https://env.example.test/v1",
                    "AI_MODEL": "env-model",
                },
                clear=True,
            ),
            patch("backend.services.ai_service.AsyncOpenAI", side_effect=make_client),
        ):
            token = set_request_ai_config(
                create_request_ai_config("user-key", "https://user.example.test/v1")
            )
            try:
                result = await call_ai("test prompt")
                self.assertEqual(os.environ["AI_API_KEY"], "env-key")
                self.assertEqual(os.environ["AI_BASE_URL"], "https://env.example.test/v1")
                self.assertEqual(os.environ["AI_MODEL"], "env-model")
            finally:
                reset_request_ai_config(token)

        self.assertEqual(result, {"key": "user-key"})
        self.assertEqual(created_clients["user-key"].close_count, 1)

    async def test_concurrent_requests_keep_user_keys_isolated(self) -> None:
        created_clients: dict[str, FakeClient] = {}

        def make_client(*, api_key: str, base_url: str, **_: object) -> FakeClient:
            client = FakeClient(api_key)
            created_clients[api_key] = client
            return client

        async def call_for_user(api_key: str) -> dict[str, object]:
            token = set_request_ai_config(
                create_request_ai_config(api_key, "https://user.example.test/v1")
            )
            try:
                await asyncio.sleep(0)
                return await call_ai("test prompt")
            finally:
                reset_request_ai_config(token)

        with (
            patch.dict(
                os.environ,
                {
                    "AI_API_KEY": "env-key",
                    "AI_BASE_URL": "https://env.example.test/v1",
                    "AI_MODEL": "env-model",
                },
                clear=True,
            ),
            patch("backend.services.ai_service.AsyncOpenAI", side_effect=make_client),
        ):
            results = await asyncio.gather(
                call_for_user("user-a-key"),
                call_for_user("user-b-key"),
            )

        self.assertEqual(results, [{"key": "user-a-key"}, {"key": "user-b-key"}])
        self.assertEqual(set(created_clients), {"user-a-key", "user-b-key"})
        self.assertEqual(created_clients["user-a-key"].close_count, 1)
        self.assertEqual(created_clients["user-b-key"].close_count, 1)

    async def test_ai_middleware_binds_headers_per_concurrent_request(self) -> None:
        captured: list[tuple[str, str] | None] = []

        async def fake_generate_creative(_request: object) -> list[object]:
            config = get_request_ai_config()
            captured.append(
                None
                if config is None
                else (config.api_key, config.base_url)
            )
            await asyncio.sleep(0.01)
            return [{"id": "creative-1", "title": "title", "description": "description"}]

        with patch("backend.main.generate_creative", fake_generate_creative):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://testserver",
            ) as client:
                responses = await asyncio.gather(
                    client.post(
                        "/api/ai/creative",
                        json=creative_request(),
                        headers={
                            "X-HotCreator-AI-Key": "user-a-key",
                            "X-HotCreator-AI-Base-Url": "https://user-a.example.test/v1",
                        },
                    ),
                    client.post(
                        "/api/ai/creative",
                        json=creative_request(),
                        headers={
                            "X-HotCreator-AI-Key": "user-b-key",
                            "X-HotCreator-AI-Base-Url": "https://user-b.example.test/v1",
                        },
                    ),
                )

        self.assertEqual([response.status_code for response in responses], [200, 200])
        self.assertEqual(
            set(captured),
            {
                ("user-a-key", "https://user-a.example.test/v1"),
                ("user-b-key", "https://user-b.example.test/v1"),
            },
        )

    async def test_ai_middleware_without_headers_keeps_backend_fallback_context_empty(self) -> None:
        captured: list[object] = []

        async def fake_generate_creative(_request: object) -> list[object]:
            captured.append(get_request_ai_config())
            return [{"id": "creative-1", "title": "title", "description": "description"}]

        with patch("backend.main.generate_creative", fake_generate_creative):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://testserver",
            ) as client:
                response = await client.post(
                    "/api/ai/creative",
                    json=creative_request(),
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured, [None])

    async def test_request_api_key_is_not_written_to_logs(self) -> None:
        secret_key = "user-secret-key"
        fake_client = FakeClient(secret_key, content='{"ok": true}')

        with (
            patch.dict(
                os.environ,
                {
                    "AI_API_KEY": "env-key",
                    "AI_BASE_URL": "https://env.example.test/v1",
                    "AI_MODEL": "env-model",
                },
                clear=True,
            ),
            patch("backend.services.ai_service.AsyncOpenAI", return_value=fake_client),
            self.assertLogs("uvicorn.error", level="INFO") as captured,
        ):
            token = set_request_ai_config(
                create_request_ai_config(secret_key, "https://user.example.test/v1")
            )
            try:
                await call_ai("test prompt", diagnostic_label="test")
            finally:
                reset_request_ai_config(token)

        self.assertNotIn(secret_key, "\n".join(captured.output))

    async def test_ai_middleware_rejects_invalid_base_url_without_echoing_key(self) -> None:
        secret_key = "user-secret-key"
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post(
                "/api/ai/creative",
                json=creative_request(),
                headers={
                    "X-HotCreator-AI-Key": secret_key,
                    "X-HotCreator-AI-Base-Url": "https://user.example.test/v1?key=bad",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertNotIn(secret_key, response.text)


if __name__ == "__main__":
    unittest.main()
