from __future__ import annotations

import time
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import backend.main as backend
from backend.hotspot_adapter import Hotspot


class HotspotStepTwoTests(unittest.TestCase):
    def test_hotspot_endpoint_returns_unified_step_two_data(self) -> None:
        hotspots = [
            Hotspot(
                title="测试热点",
                summary="用于 Step2 热点筛选流程测试",
                platform="微博",
                rank=1,
                hotScore=123456,
            )
        ]
        previous_hotspots = backend._cached_hotspots
        previous_expiration = backend._cache_expires_at
        backend._cached_hotspots = hotspots
        backend._cache_expires_at = time.monotonic() + 60

        try:
            with TestClient(backend.app) as client:
                response = client.get("/api/hotspots")
        finally:
            backend._cached_hotspots = previous_hotspots
            backend._cache_expires_at = previous_expiration

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            [
                {
                    "title": "测试热点",
                    "summary": "用于 Step2 热点筛选流程测试",
                    "platform": "微博",
                    "rank": 1,
                    "hotScore": 123456,
                }
            ],
        )

    def test_hotspot_endpoint_returns_actionable_error_when_source_fails(self) -> None:
        with (
            patch(
                "backend.main._get_cached_hotspots",
                AsyncMock(side_effect=backend.HotDataUnavailableError("unavailable")),
            ),
            TestClient(backend.app) as client,
        ):
            response = client.get("/api/hotspots")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {
                "detail": "热点数据获取失败，请前往热点信息页面查看热点后重试。"
            },
        )


if __name__ == "__main__":
    unittest.main()
