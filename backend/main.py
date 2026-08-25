from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
import time
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
import httpx
from pydantic import ValidationError

from .ai_workflows import (
    Creative,
    CreativeRequest,
    HotspotAssessment,
    HotspotReason,
    HotspotReasonRequest,
    HotspotRankingRequest,
    Prompt,
    PromptRequest,
    Script,
    ScriptRequest,
    Storyboard,
    StoryboardRequest,
    VideoConfig,
    VideoConfigRequest,
    generate_creative,
    generate_hotspot_reasons,
    generate_hotspot_ranking,
    generate_prompt,
    generate_script,
    generate_storyboard,
    generate_video_config,
)
from .hotspot_adapter import (
    HOTDATA_PLATFORMS,
    Hotspot,
    HotspotPlatform,
    adapt_hotdata_response,
    get_source_endpoint,
    interleave_hotspots,
)
from .services.ai_service import (
    AIServiceError,
    close_ai_client,
    create_request_ai_config,
    log_ai_configuration,
    reset_request_ai_config,
    set_request_ai_config,
)


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

HOTDATA_API_BASE_URL = os.getenv(
    "HOTDATA_API_BASE_URL", "https://w-hotdata.aipromptnav.com/api/hot-data"
).rstrip("/")
HOTDATA_API_KEY = os.getenv("HOTDATA_API_KEY", "").strip()
HOTDATA_TIMEOUT_SECONDS = float(os.getenv("HOTDATA_TIMEOUT_SECONDS", "8"))
HOTDATA_CACHE_TTL_SECONDS = int(os.getenv("HOTDATA_CACHE_TTL_SECONDS", "300"))
HOTSPOT_DATA_ERROR_MESSAGE = "热点数据获取失败，请前往热点信息页面查看热点后重试。"
logger = logging.getLogger("uvicorn.error")


class HotDataUnavailableError(RuntimeError):
    pass


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    log_ai_configuration()
    timeout = httpx.Timeout(HOTDATA_TIMEOUT_SECONDS)
    limits = httpx.Limits(max_connections=10, max_keepalive_connections=7)
    app.state.hotdata_client = httpx.AsyncClient(timeout=timeout, limits=limits)
    try:
        yield
    finally:
        await app.state.hotdata_client.aclose()
        await close_ai_client()


app = FastAPI(title="Hot Creator API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def bind_request_ai_config(request: Request, call_next):
    """Bind user AI headers to this request without changing process globals."""

    if not request.url.path.startswith("/api/ai/"):
        return await call_next(request)

    api_key = request.headers.get("X-HotCreator-AI-Key")
    base_url = request.headers.get("X-HotCreator-AI-Base-Url")
    if api_key is None and base_url is None:
        return await call_next(request)
    if not api_key or not base_url:
        return JSONResponse(
            status_code=400,
            content={"detail": "AI user configuration requires both apiKey and baseUrl"},
        )

    try:
        config = create_request_ai_config(api_key, base_url)
    except ValueError:
        return JSONResponse(
            status_code=400,
            content={"detail": "AI user configuration is invalid"},
        )

    token = set_request_ai_config(config)
    try:
        return await call_next(request)
    finally:
        reset_request_ai_config(token)

_cache_lock = asyncio.Lock()
_cached_hotspots: list[Hotspot] = []
_cache_expires_at = 0.0


async def _fetch_platform(
    client: httpx.AsyncClient, platform: HotspotPlatform
) -> list[Hotspot]:
    endpoint = get_source_endpoint(platform)
    response = await client.get(
        f"{HOTDATA_API_BASE_URL}/{endpoint}",
        headers={"X-API-Key": HOTDATA_API_KEY},
    )
    response.raise_for_status()
    return adapt_hotdata_response(response.json(), platform)


async def _request_hotdata(client: httpx.AsyncClient) -> list[Hotspot]:
    if not HOTDATA_API_KEY:
        raise HotDataUnavailableError("HOTDATA_API_KEY is not configured")

    results = await asyncio.gather(
        *(_fetch_platform(client, platform) for platform in HOTDATA_PLATFORMS),
        return_exceptions=True,
    )
    groups = [
        result
        for result in results
        if isinstance(result, list) and len(result) > 0
    ]

    if not groups:
        raise HotDataUnavailableError("HotData did not return usable hotspot data")

    return interleave_hotspots(groups)


async def _get_cached_hotspots(client: httpx.AsyncClient) -> list[Hotspot]:
    global _cached_hotspots, _cache_expires_at

    now = time.monotonic()
    if _cached_hotspots and _cache_expires_at > now:
        return _cached_hotspots

    async with _cache_lock:
        now = time.monotonic()
        if _cached_hotspots and _cache_expires_at > now:
            return _cached_hotspots

        hotspots = await _request_hotdata(client)
        _cached_hotspots = hotspots
        _cache_expires_at = time.monotonic() + HOTDATA_CACHE_TTL_SECONDS
        return hotspots


@app.get("/api/hotspots", response_model=list[Hotspot])
async def get_hotspots(response: Response) -> list[Hotspot]:
    try:
        hotspots = await _get_cached_hotspots(app.state.hotdata_client)
    except HotDataUnavailableError as error:
        raise HTTPException(status_code=502, detail=HOTSPOT_DATA_ERROR_MESSAGE) from error
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=HOTSPOT_DATA_ERROR_MESSAGE) from error

    response.headers["Cache-Control"] = "private, max-age=60"
    return hotspots


def _raise_ai_http_error(error: Exception) -> None:
    if isinstance(error, AIServiceError):
        status_code = error.status_code
        code = error.code
        message = str(error)
    else:
        status_code = 502
        code = "invalid_ai_response"
        message = "AI 未返回可用结果，请稍后重试。"
    raise HTTPException(
        status_code=status_code,
        detail={"status": "error", "code": code, "message": message},
    ) from error


@app.post("/api/ai/creative", response_model=list[Creative])
async def create_creative(request: CreativeRequest) -> list[Creative]:
    try:
        return await generate_creative(request)
    except (RuntimeError, ValidationError, ValueError, TypeError) as error:
        logger.error(
            "[Step3] exception_type=%s exception_message=%s",
            type(error).__name__,
            str(error),
            exc_info=True,
        )
        _raise_ai_http_error(error)


@app.post("/api/ai/hotspot-ranking", response_model=list[HotspotAssessment])
async def create_hotspot_ranking(
    request: HotspotRankingRequest,
) -> list[HotspotAssessment]:
    try:
        return await generate_hotspot_ranking(request)
    except (RuntimeError, ValidationError, ValueError, TypeError) as error:
        logger.exception("[Step2][AI评分] 请求失败，未产生可用原始结果")
        _raise_ai_http_error(error)


@app.post("/api/ai/hotspot-reasons", response_model=list[HotspotReason])
async def create_hotspot_reasons(
    request: HotspotReasonRequest,
) -> list[HotspotReason]:
    try:
        return await generate_hotspot_reasons(request)
    except (RuntimeError, ValidationError, ValueError, TypeError) as error:
        logger.exception("[Step2][推荐原因] 请求失败")
        _raise_ai_http_error(error)


@app.post("/api/ai/script", response_model=list[Script])
async def create_script(request: ScriptRequest) -> list[Script]:
    try:
        return await generate_script(request)
    except (RuntimeError, ValidationError, ValueError, TypeError) as error:
        _raise_ai_http_error(error)


@app.post("/api/ai/storyboard", response_model=list[Storyboard])
async def create_storyboard(request: StoryboardRequest) -> list[Storyboard]:
    try:
        return await generate_storyboard(request)
    except (RuntimeError, ValidationError, ValueError, TypeError) as error:
        _raise_ai_http_error(error)


@app.post("/api/ai/video-config", response_model=VideoConfig)
async def create_video_config(request: VideoConfigRequest) -> VideoConfig:
    try:
        return await generate_video_config(request)
    except (RuntimeError, ValidationError, ValueError, TypeError) as error:
        _raise_ai_http_error(error)


@app.post("/api/ai/prompt", response_model=list[Prompt])
async def create_prompt(request: PromptRequest) -> list[Prompt]:
    try:
        return await generate_prompt(request)
    except (RuntimeError, ValidationError, ValueError, TypeError) as error:
        _raise_ai_http_error(error)
