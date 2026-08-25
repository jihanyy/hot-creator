from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.ai_workflows import VideoConfig
from backend.main import app
from backend.services.ai_service import AIServiceError


def test_ai_failure_returns_structured_error_status() -> None:
    error = AIServiceError(
        "AI服务暂时不可用，请稍后重试",
        code="rate_limited",
        status_code=503,
    )
    with (
        TestClient(app) as client,
        patch("backend.main.generate_creative", AsyncMock(side_effect=error)),
    ):
        response = client.post(
            "/api/ai/creative",
            json={
                "hotspot": {
                    "title": "测试热点",
                    "summary": "测试摘要",
                    "platform": "微博",
                    "rank": 1,
                    "hotScore": 100,
                },
                "interests": ["餐饮"],
                "batchIndex": 0,
            },
        )

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "status": "error",
            "code": "rate_limited",
            "message": "AI服务暂时不可用，请稍后重试",
        }
    }


def test_video_config_endpoint_returns_only_real_ai_result() -> None:
    generated = VideoConfig(
        ratio="9:16 竖屏",
        duration="30秒",
        style="真实纪实",
        shotCount="5个镜头",
        source="ai",
    )
    with (
        TestClient(app) as client,
        patch("backend.main.generate_video_config", AsyncMock(return_value=generated)),
    ):
        response = client.post(
            "/api/ai/video-config",
            json={
                "script": {
                    "id": "script-test",
                    "title": "测试脚本",
                    "hook": "测试 Hook",
                    "body": "测试正文",
                    "ending": "测试结尾",
                }
            },
        )

    assert response.status_code == 200
    assert response.json() == generated.model_dump()
