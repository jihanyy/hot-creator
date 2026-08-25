from __future__ import annotations

from dataclasses import dataclass
from html import unescape
import re
from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field


HotspotPlatform = Literal["微博", "抖音", "小红书", "百度", "腾讯", "头条", "全网", "用户输入"]


class Hotspot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1)
    summary: str
    platform: HotspotPlatform
    rank: int = Field(ge=1)
    hotScore: int = Field(ge=0)


@dataclass(frozen=True, slots=True)
class HotDataSourceConfig:
    endpoint: str
    title_keys: tuple[str, ...]
    summary_keys: tuple[str, ...]
    score_keys: tuple[str, ...]


HOTDATA_PLATFORMS: tuple[HotspotPlatform, ...] = (
    "微博",
    "抖音",
    "小红书",
    "百度",
    "腾讯",
    "头条",
    "全网",
)


SOURCE_CONFIG: dict[HotspotPlatform, HotDataSourceConfig] = {
    "微博": HotDataSourceConfig("weibohot", ("hotword",), (), ("hotwordnum",)),
    "抖音": HotDataSourceConfig("douyinhot", ("word",), (), ("hotindex",)),
    "小红书": HotDataSourceConfig("xiaohongshu", ("hotword",), (), ("hotwordnum",)),
    "百度": HotDataSourceConfig("nethot", ("keyword",), ("brief",), ("index",)),
    # 腾讯源的 index 是从 0 开始的排名，不是热度值。
    "腾讯": HotDataSourceConfig("wxhottopic", ("word",), (), ()),
    "头条": HotDataSourceConfig("toutiaohot", ("word",), (), ("hotindex",)),
    "全网": HotDataSourceConfig("networkhot", ("title",), ("digest",), ("hotnum",)),
}


def get_source_endpoint(platform: HotspotPlatform) -> str:
    return SOURCE_CONFIG[platform].endpoint


def _read_string(record: Mapping[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _read_number(record: Mapping[str, Any], keys: tuple[str, ...]) -> int | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return max(0, int(value))
        if not isinstance(value, str):
            continue

        matches = re.findall(r"\d+(?:\.\d+)?", value)
        if matches:
            return max(0, int(float(matches[-1])))
    return None


def _clean_text(value: str) -> str:
    text = unescape(value)
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*查看更多\s*>?\s*$", "", text)
    return text.strip()


def adapt_hotdata_response(payload: Any, platform: HotspotPlatform) -> list[Hotspot]:
    if not isinstance(payload, Mapping):
        return []

    items = payload.get("list")
    if not isinstance(items, list):
        return []

    config = SOURCE_CONFIG[platform]
    hotspots: list[Hotspot] = []

    for index, item in enumerate(items):
        if not isinstance(item, Mapping):
            continue

        title = _clean_text(_read_string(item, config.title_keys))
        if not title:
            continue

        rank = index + 1
        source_summary = _clean_text(_read_string(item, config.summary_keys))
        source_score = _read_number(item, config.score_keys)
        hotspots.append(
            Hotspot(
                title=title,
                summary=source_summary,
                platform=platform,
                rank=rank,
                hotScore=source_score if source_score is not None else 0,
            )
        )

    return hotspots


def interleave_hotspots(groups: list[list[Hotspot]]) -> list[Hotspot]:
    maximum_length = max((len(group) for group in groups), default=0)
    hotspots: list[Hotspot] = []

    for index in range(maximum_length):
        for group in groups:
            if index < len(group):
                hotspots.append(group[index])

    return hotspots
