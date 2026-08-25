from __future__ import annotations

import json
import logging
from difflib import SequenceMatcher
from itertools import combinations
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

from .hotspot_adapter import Hotspot
from .services.ai_service import call_ai


logger = logging.getLogger("uvicorn.error")


class Creative(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)


class Script(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    hook: str = Field(min_length=1)
    body: str = Field(min_length=1)
    ending: str = Field(min_length=1)


class VideoConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ratio: str = Field(min_length=1)
    duration: str = Field(min_length=1)
    style: str = Field(min_length=1)
    shotCount: str = Field(min_length=1)
    source: str = Field(min_length=1)
    instruction: str | None = None


class Storyboard(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    shotNumber: int = Field(ge=1)
    duration: str = Field(min_length=1)
    visualDescription: str = Field(min_length=1)
    narration: str = Field(min_length=1)
    shootingAdvice: str = Field(min_length=1)
    imagePrompt: str = Field(min_length=1)
    videoPrompt: str = Field(min_length=1)


class VideoPromptDetails(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sceneDescription: str = Field(min_length=1)
    characterAction: str = Field(min_length=1)
    cameraMovement: str = Field(min_length=1)
    videoStyle: str = Field(min_length=1)
    timing: str = Field(min_length=1)
    fullPrompt: str = Field(min_length=1)


class Prompt(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    shotNumber: int = Field(ge=1)
    imagePrompt: str = Field(min_length=1)
    videoPrompt: VideoPromptDetails


class HotspotContext(Hotspot):
    model_config = ConfigDict(extra="ignore")

    recommendationIndex: int | None = None
    relevanceScore: int | None = None
    businessValueScore: int | None = None
    creativeValueScore: int | None = None
    matchedInterest: str | None = None
    recommendationReasons: list[str] | None = None


class VideoParameters(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ratio: str = Field(min_length=1)
    duration: str = Field(min_length=1)
    style: str = Field(min_length=1)
    shotCount: str = Field(min_length=1)


class HotspotAssessment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    index: int = Field(ge=0)
    relevance: int = Field(ge=0, le=100)
    businessValue: int = Field(ge=0, le=100)
    creativeValue: int = Field(ge=0, le=100)

    @model_validator(mode="before")
    @classmethod
    def accept_relevance_aliases(cls, value: Any) -> Any:
        if not isinstance(value, dict) or "relevance" in value:
            return value

        normalized = dict(value)
        for alias in ("relevance_score", "relevanceScore"):
            if alias in normalized:
                normalized["relevance"] = normalized[alias]
                break
        return normalized

    @field_validator("relevance", "businessValue", "creativeValue", mode="before")
    @classmethod
    def normalize_score(cls, value: Any) -> int:
        if value is None or isinstance(value, bool):
            raise ValueError("score must be a number between 0 and 100")

        candidate = value.strip() if isinstance(value, str) else value
        if isinstance(candidate, str) and candidate.endswith("%"):
            candidate = candidate[:-1].strip()
        try:
            score = float(candidate)
        except (TypeError, ValueError) as error:
            raise ValueError("score must be a number between 0 and 100") from error
        if not 0 <= score <= 100:
            raise ValueError("score must be a number between 0 and 100")
        return round(score)


class RankedHotspotForReason(BaseModel):
    model_config = ConfigDict(extra="ignore")

    index: int = Field(ge=0)
    title: str = Field(min_length=1)
    summary: str
    relevance: int = Field(ge=0, le=100)
    businessValue: int = Field(ge=0, le=100)
    creativeValue: int = Field(ge=0, le=100)
    finalScore: int = Field(ge=0, le=100)


class HotspotReason(BaseModel):
    model_config = ConfigDict(extra="ignore")

    index: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=160)


class CreativeRequest(BaseModel):
    hotspot: HotspotContext
    interests: list[str] = Field(min_length=1, max_length=8)
    batchIndex: int = 0
    instruction: str | None = None
    currentCreatives: list[Creative] | None = None


class ScriptRequest(BaseModel):
    hotspot: HotspotContext
    industry: str = Field(min_length=1, max_length=60)
    creativeIdea: Creative
    videoStyle: str = Field(min_length=1)
    instruction: str | None = None
    currentScript: Script | None = None


class StoryboardRequest(BaseModel):
    script: Script
    videoConfig: VideoParameters
    batchIndex: int = 0
    instruction: str | None = None
    currentStoryboards: list[Storyboard] | None = None


class VideoConfigRequest(BaseModel):
    script: Script
    instruction: str | None = None
    currentConfig: VideoConfig | None = None


class PromptRequest(BaseModel):
    storyboards: list[Storyboard]
    instruction: str | None = None
    currentPrompts: list[Prompt] | None = None


class HotspotRankingRequest(BaseModel):
    interests: list[str] = Field(min_length=1, max_length=8)
    hotspots: list[Hotspot] = Field(min_length=1, max_length=21)


class HotspotReasonRequest(BaseModel):
    interests: list[str] = Field(min_length=1, max_length=8)
    hotspots: list[RankedHotspotForReason] = Field(min_length=1, max_length=7)


def _json(value: BaseModel | list[BaseModel]) -> str:
    if isinstance(value, list):
        data: Any = [item.model_dump(exclude_none=True) for item in value]
    else:
        data = value.model_dump(exclude_none=True)
    return _dump(data)


def _dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _clip(value: str, limit: int) -> str:
    return value if len(value) <= limit else f"{value[:limit]}…"


def _storyboard_context(request: StoryboardRequest) -> dict[str, Any]:
    return {
        "script": request.script.model_dump(),
        "video": {
            "ratio": request.videoConfig.ratio,
            "duration": request.videoConfig.duration,
            "style": request.videoConfig.style,
            "shotCount": request.videoConfig.shotCount,
        },
    }


def _storyboard_items(storyboards: list[Storyboard]) -> list[dict[str, Any]]:
    return [item.model_dump() for item in storyboards]


def _prompt_storyboard_rows(
    storyboards: list[Storyboard],
) -> list[list[Any]]:
    return [
        [
            item.id,
            item.shotNumber,
            item.duration,
            item.visualDescription,
            item.narration,
            item.shootingAdvice,
            item.imagePrompt,
            item.videoPrompt,
        ]
        for item in storyboards
    ]


DOMAIN_DEFINITIONS = {
    "电商零售": "商品、消费趋势、电商平台、品牌营销、新消费、购物行为、价格变化",
    "餐饮": "餐厅、食品、菜品、餐饮消费、门店经营、餐饮趋势",
    "酒店民宿": "酒店、住宿、旅游、出行消费、民宿",
    "教育": "教育政策、学校、学习、考试、家长学生",
    "美妆": "美妆品牌、护肤、化妆、美容消费",
    "宠物娱乐": "宠物、娱乐、影视、游戏、IP",
    "自媒体": "内容平台、创作者、流量趋势",
}


async def generate_creative(request: CreativeRequest) -> list[Creative]:
    instruction = request.instruction or "先理解热点的传播驱动力，再生成3-5个有趣、可拍且思路明显不同的短视频创意，并自然连接用户行业"
    definitions = {
        interest: DOMAIN_DEFINITIONS.get(interest, interest)
        for interest in request.interests
    }
    is_self_media = "自媒体" in request.interests
    creation_mode = (
        "用户选择了自媒体领域，可以在事实边界内进行事件解读、趋势分析、观点表达、社会议题或科普；允许热点成为讨论入口，但不得杜撰事实、判断未经证实的责任、攻击个人或品牌，也不能只复述新闻经过。"
        if is_self_media
        else "用户运营的是与所选行业相关的账号。创意应自然连接该账号的受众、场景、知识、体验或业务世界，可以服务业务，也可以只是好看、好玩、有共鸣或有讨论价值；不要求每条都介绍产品、服务或转化。不得把未经证实的涉事品牌或个人当作主角，不得编造用户现实中未提供的资源或条件。"
    )
    current_creatives = _json(request.currentCreatives) if request.currentCreatives else "无"
    result = await call_ai(
        f"""
你是中文短视频创意策划与创意导演。你的任务首先是发现真正有意思、值得拍、彼此不同的短视频内容，其次才是把内容自然连接到用户行业；不要把自己当成只会生成营销方案、品牌分析或转化话术的文案。
当前热点（包含Step2的标题、摘要、匹配领域、评分和recommendationReasons）：{_json(request.hotspot)}
用户关注领域：{_dump(definitions)}
创作模式：{creation_mode}
当前创意完整数据：{current_creatives}
调整指令：{instruction}
批次：{request.batchIndex + 1}

返回严格 JSON：
{{"creatives":[{{"id":"creative-1","title":"创意标题","description":"具体、可执行的创意说明"}}]}}
要求：
1. creatives 返回3-5项，id 和标题均唯一，不要输出 JSON 以外的内容。
2. 生成前只在内部完成以下思考，不要输出分析过程、固定标签或新增字段：
   a. 先理解热点为什么让人想看：从情绪、共鸣、身份或地域认同、新鲜感、猎奇、反差、冲突、争议、好奇心、实用价值、信息差、生活或消费变化、社会情绪、趋势、意外、荒诞感、娱乐性、群体参与、故事性、视觉冲击、价值观讨论等维度中，提炼本热点真实存在的传播驱动力。以上只是思考方向，不是必须套用的分类，也不要强迫热点归入某个标签。
   b. 把这个传播驱动力提炼为内容母题：先回答“围绕这个热点最值得拍的内容是什么”，不要先回答“如何帮助商家转化”。母题只用于内部推理，不必原样写入description。
   c. 先在内部发散出多于最终数量的候选方向，再筛选3-5条最有趣、最适合拍摄且差异最大的方案。根据热点本身选择内容机制，例如故事、对比、反差、挑战、实验、实测、复刻、体验、观察、记录、Vlog、第一视角、情景演绎、采访、观点、科普、解释、盘点、攻略、清单、教程、幕后、过程、揭秘、误区纠正、时间线、身份代入、情绪表达或互动；这些只是可能性，不是模板库，不能机械凑齐，也不能因为某个机制常见就强行使用。不适合挑战、采访或实测的热点，不要硬套。
   d. 内容发散之后，再寻找用户行业与创意之间的自然连接。行业结合可以来自受众、场景、知识、体验、生活方式、从业者视角、用户问题、行业幕后或业务世界，不等于每条都要展示店铺、产品、服务、老板、顾客、购买或转化。商业价值可以自然存在，也可以只是让账号好看、好玩、有共鸣、有讨论、提升内容质量或建立账号性格。
   e. 检查现实条件：不要假设用户一定有某类顾客、人物、地点、设备、产品、特殊场所或已经开展的活动。依赖未知条件的方案要改成不依赖特殊资源的版本，或明确写成“如果条件允许”；不得为了显得具体而虚构用户现实。
   f. 做真正的差异检查：比较候选方案的核心观看理由、内容机制、叙事方式、情绪、视角、结构、主要场景、用户参与方式、信息价值和娱乐价值。若只是换标题、换同义词，或拍出来基本是同一条视频，就视为重复并重写。
3. Step2负责解释“为什么这个热点值得关注”，Step3负责回答“基于这个热点，哪些短视频创意真正有意思、值得拍”。继承Step2的summary、matchedInterest和recommendationReasons来理解热点，但不要把Step2改写成行业报告，也不要只复述新闻经过。热点是创作入口，不是固定套路；每次都要根据当前热点重新判断最合适的内容方向。
4. 每个创意都应有清晰的观看理由、画面感和短视频感。description用简洁自然的语言说明“点子是什么、视频大概在什么场景中拍什么或观察什么、核心动作/冲突/体验是什么、观众为什么想继续看”，并说明它与热点及用户行业的自然连接。不要强迫使用“拍摄”“展示”“下单”“顾客”“产品”“服务”等指定词；自然表达即可，也不要写成长篇商业分析。
5. Step3只输出创意概念，不写完整脚本、逐镜头方案或成段台词；这些留给Step4。不要输出热点母题、传播驱动力、行业影响、品牌价值、转化路径等分析字段。每条创意应能独立理解，不要求观众预先了解新闻；也不要把未经证实的事件细节当成事实。
6. 非自媒体账号要与所选行业的受众、场景或业务世界自然相关，但不要求每条都出现“我们店”“我们的产品”“我们的服务”、老板、店员、顾客或购买转化。可以做行业观察、用户场景、生活方式、实用知识、情绪共鸣、故事、体验、幕后、反差或热点二创，只要连接自然。不得把未经证实的涉事品牌或个人当作主角，不得默认攻击、站队或判断责任。
7. 如果用户选择自媒体，可以更自由地使用观点、事件解读、趋势、社会议题、故事、知识、娱乐二创或情绪表达；仍须区分事实与推断，不杜撰细节，不判断未经证实的责任，不攻击个人或品牌。
8. 标题应让人一眼知道视频的独特切入点并产生观看兴趣，可以使用具体对象、场景、动作、问题、反差、结果或情绪，但不要写成行业报告、品牌分析或“如何提升转化”的方案标题。不要使用“热点复盘、事件点评、争议始末、涉事品牌”等只围绕新闻本身的标题，也不要把原热点标题直接复制进创意标题或description。
9. 同一批创意必须在思路上真正不同，而不是标题不同。至少在核心观看理由、内容机制、叙事视角、情绪、主要场景、观众收获或参与方式等方面形成明显差异。批次越靠后，越要主动避开前一批已经使用过的套路；如果提供了当前创意完整数据，要继承同一热点洞察和用户领域，根据调整指令重新生成不同方案，不能原样返回或只回复说明。
        """.strip(),
        diagnostic_label="Step3",
    )
    logger.info(
        "[Step3] workflow_parsed_top_level=%s",
        _dump(result),
    )
    raw_creatives = result.get("creatives")
    if not isinstance(raw_creatives, list):
        raise TypeError("AI returned an invalid creatives collection")

    creatives: list[Creative] = []
    rejected_count = 0
    creative_adapter = TypeAdapter(Creative)
    for item_index, raw_creative in enumerate(raw_creatives):
        try:
            creatives.append(creative_adapter.validate_python(raw_creative))
        except ValidationError as error:
            rejected_count += 1
            logger.warning(
                "[Step3] rejected creative item index=%s exception_type=%s exception_message=%s",
                item_index,
                type(error).__name__,
                str(error),
            )

    logger.info(
        "[Step3] AI returned %s creatives, accepted %s, rejected %s",
        len(raw_creatives),
        len(creatives),
        rejected_count,
    )
    if not 3 <= len(creatives) <= 5:
        raise ValueError(
            f"AI returned {len(creatives)} valid creative ideas; "
            "AI must return between 3 and 5 creative ideas"
        )
    normalized_titles = {item.title.strip().casefold() for item in creatives}
    if len(normalized_titles) != len(creatives):
        raise ValueError("AI returned duplicate creative titles")
    if request.instruction and request.currentCreatives:
        before = {
            (item.title.strip().casefold(), item.description.strip().casefold())
            for item in request.currentCreatives
        }
        after = {
            (item.title.strip().casefold(), item.description.strip().casefold())
            for item in creatives
        }
        if before == after:
            raise ValueError("AI did not modify the creative ideas")
    source_title = request.hotspot.title.strip().casefold()
    if source_title and any(
        source_title in f"{item.title} {item.description}".casefold()
        for item in creatives
    ):
        raise ValueError("AI copied the hotspot title into a creative idea")
    forbidden_event_phrases = (
        "热点复盘",
        "热点点评",
        "事件复盘",
        "事件点评",
        "争议始末",
        "涉事品牌",
        "当事人回应",
    )
    if any(
        phrase in f"{item.title} {item.description}"
        for item in creatives
        for phrase in forbidden_event_phrases
    ):
        raise ValueError("AI returned an event-centered creative idea")
    if not is_self_media:
        media_title_phrases = (
            "消费者应该如何",
            "消费者如何",
            "行业应该如何",
            "行业如何",
            "从业者应该如何",
            "从业者如何",
            "行业报告",
            "行业分析",
        )
        if any(
            phrase in item.title
            for item in creatives
            for phrase in media_title_phrases
        ):
            raise ValueError("AI returned a media-style creative title")

        generic_description_markers = (
            "结合热点",
            "做一期",
            "有价值",
            "品牌内容",
            "提升品牌影响力",
            "引发关注",
            "提升影响力",
        )
        if any(
            sum(
                marker in item.description
                for marker in generic_description_markers
            )
            >= 3
            for item in creatives
        ):
            raise ValueError("AI returned a non-executable merchant creative idea")
    return creatives


async def generate_hotspot_ranking(
    request: HotspotRankingRequest,
) -> list[HotspotAssessment]:
    definitions = {
        interest: DOMAIN_DEFINITIONS.get(interest, interest)
        for interest in request.interests
    }
    hotspot_rows = [
        [
            index,
            item.title,
            _clip(item.summary, 240),
            item.platform,
        ]
        for index, item in enumerate(request.hotspots)
    ]
    result = await call_ai(
        f"""
任务：评估热点是否适合所选领域用户创作短视频。
领域：{_dump(definitions)}
热点字段：[index,title,summary,platform]
热点数据：{_dump(hotspot_rows)}
仅返回 JSON：
{{"assessments":[{{"index":0,"relevance":0,"businessValue":0,"creativeValue":0}}]}}
要求：
1. 每个 index 恰好一项，三个分数均为0-100整数。
2. 必须先在内部完成语义与行业传导判断，再评分；不要先给分再反向拼理由，也不要输出内部分析过程。
3. 先识别事件实际发生了什么，再提炼其中真正相关的消费者关注、需求或情绪变化、价格与信任问题、服务体验、出行天气与节日窗口、平台政策与商业模式、成本流量与生活方式变化等信号。只选择事件确实包含的因素，不要机械检查清单或补充摘要没有支持的事实。
4. 对每个所选领域分别在内部判断为直接相关、间接相关、弱相关或无关：事件发生在行业内属于直接相关；标题未出现行业词，但存在明确、自然、可信的“热点变化 → 用户/市场变化 → 行业经营或消费影响”链路，可以属于间接相关；只能靠泛化词或假设强行连接的属于弱相关或无关。
5. 多领域使用“至少一个领域成立”原则：只要与其中一个领域有明确价值即可提高相关度，不要求同时满足全部领域；评分应依据关联最清晰的领域，不能为了覆盖更多领域牵强解释。
6. 关键词只能作为辅助信号。标题没有行业关键词不能直接判无关；标题出现行业关键词也不能直接判高相关，必须验证事件内容和影响路径。
7. relevance 衡量行业关联强度与传导链可信度。直接相关通常较高；间接相关按影响路径的明确程度评分；弱相关或无关必须低于20。无关社会新闻必须低于20，不得因热度高而抬分，也不要为了凑推荐数量强行给到20以上。
8. businessValue 衡量该变化对消费需求、购买决策、经营机会、服务与品牌信任或商业转化的真实价值；creativeValue 衡量它是否有具体、可信、可理解的短视频表达空间。两项都不能只因话题热度高而抬分。
9. 信息不足时保守评分，不得杜撰影响路径。本阶段只评分，不生成推荐原因、视频方向或其他解释。
""".strip()
    )
    logger.info("[Step2][AI评分] 原始返回：%s", _dump(result))
    assessments = TypeAdapter(list[HotspotAssessment]).validate_python(
        result.get("assessments")
    )
    returned_indexes = [item.index for item in assessments]
    if len(returned_indexes) != len(set(returned_indexes)):
        raise ValueError("AI returned duplicate hotspot assessment indexes")
    if any(index >= len(request.hotspots) for index in returned_indexes):
        raise ValueError("AI returned an invalid hotspot assessment index")
    return assessments


async def generate_hotspot_reasons(
    request: HotspotReasonRequest,
) -> list[HotspotReason]:
    definitions = {
        interest: DOMAIN_DEFINITIONS.get(interest, interest)
        for interest in request.interests
    }
    hotspot_rows = [
        [
            item.index,
            item.title,
            _clip(item.summary, 240),
            item.relevance,
            item.businessValue,
            item.creativeValue,
            item.finalScore,
        ]
        for item in request.hotspots
    ]
    result = await call_ai(
        f"""
任务：只为最终展示的热点生成简洁、具体的领域推荐原因。
领域：{_dump(definitions)}
热点字段：[index,title,summary,relevance,businessValue,creativeValue,finalScore]
热点数据：{_dump(hotspot_rows)}
仅返回 JSON：
{{"reasons":[{{"index":0,"reason":"为什么这个热点适合该领域用户创作"}}]}}
要求：
1. 每个 index 恰好一项；reason 不超过120个汉字，不输出JSON以外的内容。
2. 生成前在内部复核：热点真正反映了什么变化或矛盾；消费者、用户或市场正在关注什么；该变化通过什么明确路径影响至少一个所选领域；为什么它当前值得该领域关注。不要输出内部分析步骤。
3. reason用1-3句自然串联“事件/变化本质 → 消费者或市场信号 → 对具体领域的影响路径 → 当前关注价值”，明确主要对应哪个领域；若确实同时影响多个领域，可以自然说明，但不要求覆盖全部领域。
4. 不得只写“热度高、与行业相关、适合创作、具有传播价值”等空泛结论；不得因为标题出现行业词就省略影响分析，也不得为弱关联强行编造传导链。
5. 只解释“为什么值得关注”，不要输出具体拍法、创意标题、镜头、脚本或完整视频方案，创意转译留给Step3。
6. 只能使用标题、摘要和给定评分能够支持的信息；涉及品牌、个人或争议时，不判断未经证实的责任，不攻击或站队。
""".strip()
    )
    reasons = TypeAdapter(list[HotspotReason]).validate_python(result.get("reasons"))
    expected_indexes = {item.index for item in request.hotspots}
    returned_indexes = [item.index for item in reasons]
    if len(returned_indexes) != len(set(returned_indexes)):
        raise ValueError("AI returned duplicate hotspot reason indexes")
    if not reasons:
        logger.warning(
            "[Step2][推荐原因] AI returned 0 valid reasons for %s displayed hotspots",
            len(expected_indexes),
        )
        return []
    if any(index not in expected_indexes for index in returned_indexes):
        raise ValueError("AI returned an invalid hotspot reason index")
    logger.info(
        "[Step2][推荐原因] AI returned %s valid reasons for %s displayed hotspots",
        len(reasons),
        len(expected_indexes),
    )
    return reasons


SCRIPT_STYLE_GUIDES = {
    "抽象创意": "在内容骨架完成后，用反差、视觉隐喻、拟人化或小实验调整表达方式；只有当骨架需要时才使用这些手法，不把它们当成固定内容。",
    "情绪观点": "在内容骨架完成后，用具体问题或冲突、明确立场和情绪强弱调整语言节奏；观点和事实由所选创意决定，不攻击任何品牌或个人。",
    "专业分析": "在内容骨架完成后，用数据项、逻辑关系、步骤拆解或可验证对比整理表达；没有可靠数字时不得编造数据，也不要为了显得专业添加无关分析。",
    "故事叙述": "在内容骨架完成后，用具体人物、场景推进、变化和情绪转折增强叙事；只有所选创意需要故事或人物时才使用，不凭空设置角色和事件。",
    "故事讲述": "在内容骨架完成后，用具体人物、经营情境、意外变化和情绪转折增强叙事；只有所选创意需要故事或人物时才使用，不凭空设置角色和事件。",
    "轻松幽默": "在内容骨架完成后，用生活化误会、角色反差、节奏包袱或轻微荒诞调整表达；笑点来自内容场景而不是攻击对象，不强行落回产品或服务。",
    "幽默": "在内容骨架完成后，用生活化误会、角色反差、节奏包袱或轻微荒诞调整表达；笑点来自内容场景而不是攻击对象，不强行落回产品或服务。",
    "知识科普": "在内容骨架完成后，用概念区分、原因解释、常见误区和易懂类比推进表达；优先讲清楚知识，不编造数据、研究或权威来源。",
    "反转剧情": "在内容骨架完成后，用前后认知差、信息揭示或情境转折增强观看动力；反转必须由所选创意和已有事实支持，不凭空制造人物、事故或冲突。",
    "听AI推荐": "在内容骨架完成后，根据所选创意选择最能放大其核心内容的表达方式；必须服务内容本身，不能使用通用商家口播模板。",
}


async def generate_script(request: ScriptRequest) -> list[Script]:
    instruction = request.instruction or "围绕用户已选择的创意生成3个内容机制或叙事推进方式不同的中文短视频脚本"
    current = _json(request.currentScript) if request.currentScript else "无"
    video_style = request.videoStyle
    style_guide = SCRIPT_STYLE_GUIDES.get(
        video_style,
        f"严格体现“{video_style}”的语言、叙事和画面机制，使其与其他风格明显不同。",
    )
    result = await call_ai(
        f"""
任务：把 Step3 已选择的 creative 直接发展成内容完整、推进清楚的中文短视频脚本。你首先是内容编剧，其次才考虑行业表达；不要把 creative 再次改写成营销方案。
热点洞察来源：{_json(request.hotspot)}
用户行业：{request.industry}
所选创意：{_json(request.creativeIdea)}
视频风格：{video_style}
该风格的写作机制：{style_guide}
当前脚本：{current}
用户指令：{instruction}

返回严格 JSON：
{{"scripts":[{{"id":"script-1","title":"标题","hook":"前3秒 Hook","body":"正文","ending":"结尾"}}]}}
如果有当前脚本或修改指令，返回1个修改后脚本；否则返回3个方案。
要求：
1. 先在内部确定四项输入各自的职责：hotspot 只提供已知的背景、变化或关注入口；industry 只提供账号可能关联的语境；creativeIdea 决定本条视频的核心命题、内容边界和主要观看理由；videoStyle 只在内容骨架完成后调整语言、句式、节奏、情绪强弱和表现方式。四项都必须真实影响脚本，但不能让 videoStyle 改变 creativeIdea 的核心命题。
2. 在写任何 title、hook、body、ending 之前，先在内部判断 creativeIdea 最主要靠什么成立：观点、知识解释、故事、情绪共鸣、观察、体验、对比、反差、盘点、攻略、记录、实测、挑战、复刻、剧情、娱乐、评论，或其他更准确的内容机制。不要输出分类，也不要强迫 creativeIdea 归入固定分类；只回答“这本质上是什么视频”。
3. 根据识别出的内容机制选择推进方式，不要让所有 creative 都使用 Hook → 三个观点 → 总结 → CTA。观点型内容要建立并推进观点；知识型内容要把一个问题解释清楚；故事型内容要有事件发展和变化；体验型内容要有过程和发现；对比型内容要让差异产生意义；情绪型内容要有具体情境和情绪递进；娱乐型内容要有适合该创意的节奏、反差、包袱或参与感。以上只是内部参考，不是固定模板，具体结构由当前 creative 决定。
4. 在内部先形成一条完整内容骨架，再写脚本字段。骨架至少要回答：开头为什么值得看；第一部分给观众什么；下一部分为什么自然接上；中间增加了什么新的信息、发现、解释、冲突、反差、情绪、阶段、问题、答案或转折；最后如何从前面的内容自然得到结论、发现、观点、情绪、记忆点或开放讨论。骨架不要作为字段返回。
5. 对骨架做推进检查：每个主要节点都必须增加新的观看价值，不能连续重复同一个观点或换同义词解释同一件事。如果连续两个段落本质相同，必须合并或重写；如果中段没有新信息、新变化或新情绪，必须重新设计推进。
6. 骨架完成后，再将它写成 title、hook、body、ending。Hook 不固定为夸张提问或商业承诺，可以根据内容机制从场景、问题、观点、发现、冲突、动作或一句关键表达切入；body 要保留骨架中的递进关系；ending 要从整条内容最后走到的位置自然产生，可以是答案、观点、反转、发现、情绪、记忆点或开放讨论，不是固定的 CTA 插槽。
7. 内容型 creative 不做二次商业转译。若 creativeIdea 主要是知识、观点、故事、娱乐、观察、体验、情绪或讨论，直接把内容讲清楚、讲完整、讲出认知变化；不得自动加入产品销售、服务宣传、购买路径、品牌证明、到店/咨询/下单或营销 CTA。只有 creativeIdea 本身明确包含推广目标，或用户指令明确要求商业转化时，才自然写入营销表达。
8. 脚本完成后才应用“{video_style}”：{style_guide} style 只能改变已完成骨架的语言、句式、节奏、情绪强弱、包袱密度、表达方式和叙事感觉，不能决定视频讲什么，也不能为了体现风格凭空制造无关人物、事件、道具或戏剧冲突。
9. 脚本最终应让观众相较开头至少发生一种变化：知道了新的东西、改变一个看法、理解一个原因、看到一个反差、经历一个故事、获得一种情绪、得到一个结论，或对问题产生新的兴趣。不能只是重新复述热点和 creativeIdea。
10. 只使用 hotspot、industry、creativeIdea、user instruction 能支持的事实和条件。不要默认用户拥有未提供的人物、顾客、设备、地点、产品、特殊场所、数据或经营活动；不要为了短视频感制造无关拍摄事故。热点仅是 Step3 洞察的上游来源，不要提热点标题、原新闻、原品牌、原人物或原经过，也不要输出热点解读、事件复盘、真相揭秘、新闻评论等媒体账号内容。
事实可靠性与证据边界（只在内部执行，不新增字段）：
   a. 可以创造表达，但不能创造事实。可以自由创作文案、句式、比喻、类比、梗、节奏、叙事结构、观点组织、情绪表达、Hook、内容推进和Ending；但不得把模型自行创造的内容伪装成真实发生的事实。
   b. 脚本中的事实性内容优先来自 hotspot、creativeIdea、current script、user instruction、industry context 以及请求中明确提供的其他信息。上下文没有提供的具体事实，不要为了显得专业、具体或可信而自行补充；current script 中的表达也不能被擅自扩展成更精确的事实。
   c. 除非当前输入明确提供可靠依据，不得自行生成具体百分比、增长率、下降率、金额、人数、时间周期效果、统计结果、调查结果、临床结果、实验结果、检测结果、研究结论、样本量、排名、市场份额、转化率、成功率、风险概率、性能参数或其他伪精确数字。
   d. 如果上下文没有明确来源，不得写“研究显示”“数据显示”“实验表明”“临床证明”“专家表示”“医生认为”“官方数据显示”“权威机构指出”等表述，也不得创造研究机构、医院、大学、实验室、专家、医生、学者、调查机构、报告、论文或政策出处。
   e. 不得把上下文没有提供的现实事件或资源写成已经发生，例如某人做过实验、某顾客有真实经历、某账号采访过某人、某商家做过测试、某团队拥有设备、某产品已有检测报告、某活动已经举办或某合作已经发生。若内容确实需要这些元素，只能明确写成假设、示意、模拟或可选拍法，不能伪装成真实案例。
   f. 专业感不等于堆数据、研究、专家、设备或术语。没有可靠数据时，优先用逻辑拆解、概念区分、因果边界、判断方法、常见误区、日常类比、现象与观点推进内容，不要编数字证明观点。
   g. 可以使用把握较高的稳定通用知识辅助解释，但不要把不确定知识写成绝对事实，不要制造虚假精确度、具体数字、研究来源或权威背书。不确定时降低表述强度，使用“通常”“可能”“一般来说”“更合理的理解是”“关键区别在于”等有边界的表达，或直接省略。
   h. 不要因为两个概念相关就擅自写成确定因果；如果输入只支持“有关联”，就不要升级成“一定导致”。不要把多个听起来专业的术语、机制、数据和权威身份拼成未经支持的伪科学式结论。
   i. 在最终输出前内部检查所有具体数字、统计值、研究结果和实验结果：如果不能明确追溯到当前输入，就删除数字，或改写成不依赖具体数值也成立的表达。事实不足时不要停止生成，改用提问、逻辑比较、已知差异、类比、常见误区、观众心理、现象与观点或明确的假设性表达继续推进。
   j. 事实边界只决定哪些内容可以作为事实说出，不得破坏 creativeIdea 的内容机制、内容骨架、观看理由、认知变化、节奏和记忆点。事实可靠性只通过语义判断和谨慎措辞实现，不要求固定关键词，不调用外部搜索，不新增第二次 AI 审核。
11. 初次生成的3个方案必须真正不同：标题不同，Hook 不同，正文核心逻辑和推进顺序不同，结尾也要服务各自的内容机制；不能只改同义词、场景名或 CTA。相同 creative 可以有不同的内容入口和推进结构，但不能改变其核心命题。
12. videoStyle 只是在生成时控制语气和节奏的内部参数。绝对不能在 title、hook、body、ending 中复述风格值，不能出现“整体采用某风格”“视频采用某风格”“表达节奏遵循某风格”或“听AI推荐”等说明。
13. title、hook、body、ending 会原样展示给最终用户，只能写成可直接使用的脚本内容。禁止输出 AI 推荐说明、生成过程解释、用户指令、系统提示、模型说明或给模型看的执行要求。
14. Step4 只完成内容脚本，不要详细设计逐秒时间、镜号、景别、运镜、机位、摄影参数、完整画面表、生图提示词或生视频提示词；这些留给后续步骤。
15. 每个 script 对象只能包含 id、title、hook、body、ending，不要添加 style、explanation、reasoning、instruction、notes 等字段。风格已由工作流独立保存，无需写入脚本响应。
""".strip()
    )
    raw_scripts = result.get("scripts")
    allowed_script_fields = {"id", "title", "hook", "body", "ending"}
    if not isinstance(raw_scripts, list) or any(
        not isinstance(item, dict) or set(item) != allowed_script_fields
        for item in raw_scripts
    ):
        raise ValueError("AI returned unexpected script fields")
    scripts = TypeAdapter(list[Script]).validate_python(raw_scripts)
    if request.currentScript is not None and request.instruction:
        if len(scripts) != 1:
            raise ValueError("AI must return exactly 1 modified script")
        modified_script = scripts[0]
        for field in ("title", "hook", "body", "ending"):
            if (
                "".join(getattr(modified_script, field).split()).casefold()
                == "".join(getattr(request.currentScript, field).split()).casefold()
            ):
                raise ValueError(f"AI did not modify script {field}")
    if request.currentScript is None and request.instruction is None:
        if len(scripts) != 3:
            raise ValueError("AI must return exactly 3 initial scripts")
        for field in ("title", "hook", "body", "ending"):
            normalized_values = {
                "".join(getattr(item, field).split()).casefold()
                for item in scripts
            }
            if len(normalized_values) != len(scripts):
                raise ValueError(f"AI returned duplicate script {field}")
        script_contents = [
            f"{item.hook}\n{item.body}\n{item.ending}"
            for item in scripts
        ]
        if any(
            SequenceMatcher(None, left, right).ratio() >= 0.86
            for left, right in combinations(script_contents, 2)
        ):
            raise ValueError("AI returned overly similar scripts")
    source_title = request.hotspot.title.strip().casefold()
    forbidden_script_phrases = (
        "热点",
        "事件复盘",
        "事件点评",
        "真相揭秘",
        "新闻评论",
        "新闻点评",
        "涉事品牌",
        "当事人回应",
    )
    forbidden_process_phrases = (
        "整体采用",
        "视频采用",
        "表达节奏遵循",
        "视频风格",
        "AI推荐",
        "AI 推荐",
        "听AI推荐",
        "生成过程",
        "用户指令",
        "系统提示",
        "模型说明",
        "给模型",
        "执行要求",
    )
    generic_template_phrases = (
        "展示流程",
        "公开透明",
        "建立信任",
        "提升信任",
        "促进转化",
    )
    if any(
        source_title and source_title in f"{item.title} {item.hook} {item.body} {item.ending}".casefold()
        for item in scripts
    ):
        raise ValueError("AI copied the hotspot title into a script")
    if any(
        phrase in f"{item.title} {item.hook} {item.body} {item.ending}"
        for item in scripts
        for phrase in forbidden_script_phrases
    ):
        raise ValueError("AI returned a news-oriented script")
    style = request.videoStyle.strip()
    if any(
        any(
            phrase in f"{item.title} {item.hook} {item.body} {item.ending}"
            for phrase in forbidden_process_phrases
        )
        or (style and style in f"{item.title} {item.hook} {item.body} {item.ending}")
        for item in scripts
    ):
        raise ValueError("AI returned system-oriented script text")
    if any(
        sum(phrase in item.body for phrase in generic_template_phrases) >= 2
        for item in scripts
    ):
        raise ValueError("AI returned a generic script template")
    return scripts


async def generate_storyboard(request: StoryboardRequest) -> list[Storyboard]:
    instruction = request.instruction or "根据视频参数生成完整、可执行的分镜列表"
    context = _dump(_storyboard_context(request))
    current = _dump(_storyboard_items(request.currentStoryboards or []))
    result = await call_ai(
        f"""
任务：生成或修改中文短视频分镜，结果必须能直接作为后续图片生成和视频生成 Prompt 的输入。
输入：{context}
当前分镜：{current}
要求：{_clip(instruction, 600)}；批次：{request.batchIndex + 1}

内容要求：
1. 每个镜头只突出一个核心视觉重点。一个镜头只安排一条清晰、可连续拍摄的动作或变化；无法同时呈现的多个信息必须拆到不同镜头，不能堆叠概念。
2. visualDescription 必须具体组织为以下信息：
   - 镜头目的：说明这个镜头为什么存在，例如制造疑问、展示变化、解释概念、强化情绪或给出结论；目的必须服务画面，不要只写抽象口号。
   - 画面主体：明确主要拍摄对象和视觉中心，写清人物、物体或页面中真正要被看见的内容。
   - 场景环境：明确发生地点、背景、空间关系和氛围，让画面可以被直接搭建或生成。
   - 动作变化：明确人物或物体做什么、页面如何变化、画面中发生什么可见动态；不要只写“展示”“突出”“快速切换”等无法执行的概括。
3. shootingAdvice 必须具体包含：景别、镜头运动、节奏、视觉重点。镜头语言要与动作变化一致，并说明观众此刻应该看哪里。
4. narration 只使用对应脚本表达，保持原意和关键事实，不擅自改写核心意思，不为现象补充脚本没有提供的结论。
5. imagePrompt 用于单帧生图：具体写出主体、场景、构图、光线、色彩/风格和视觉中心；只描述这一帧能看见的内容，避免抽象词和无法画出的过程。
6. videoPrompt 用于视频生成：具体写出主体动作、物体或页面的连续变化、镜头运动、节奏、起始状态和结束状态；只安排一个连贯动作，不要把多个不可能同时发生的动作塞进同一镜头。

事实边界：只能使用输入的热点、脚本和视频参数中已有的信息。不得新增热点没有提供的人物、身份、机构、实验、数据或原因解释；如果热点只描述一个现象，只呈现这个现象，不自行解释背后的原因。

输出约束：只能使用现有字段，不得增加 JSON 字段。每个 storyboard 必须完整填写 id、shotNumber、duration、visualDescription、narration、shootingAdvice、imagePrompt、videoPrompt。镜头数量必须严格匹配 video.shotCount；例如 video.shotCount 为“5个镜头”时，必须返回恰好5条 storyboard。shotNumber 从1连续递增。
仅返回 JSON，不要 Markdown 或解释文字：
{{"storyboards":[{{"id":"shot-1","shotNumber":1,"duration":"3秒","visualDescription":"镜头目的：制造疑问；画面主体/视觉中心：明确的主体；场景环境：具体地点、背景和氛围；动作变化：一个可见且连续的动作或变化。","narration":"对应脚本旁白，保持原意","shootingAdvice":"景别：中近景；镜头运动：缓慢推进；节奏：先停顿后推进；视觉重点：主体的关键变化。","imagePrompt":"单帧可见的主体、具体场景、构图、光线、色彩和视觉中心","videoPrompt":"主体从起始状态完成一个连贯动作至结束状态，镜头缓慢推进，节奏先停顿后推进，保持主体和场景连续"}}]}}
""".strip()
    )
    storyboards = TypeAdapter(list[Storyboard]).validate_python(result.get("storyboards"))
    if request.instruction and request.currentStoryboards:
        def content(items: list[Storyboard]) -> list[dict[str, Any]]:
            return [
                item.model_dump(exclude={"id"})
                for item in sorted(items, key=lambda value: value.shotNumber)
            ]

        if content(storyboards) == content(request.currentStoryboards):
            raise ValueError("AI did not modify the storyboards")
    return storyboards


async def generate_video_config(request: VideoConfigRequest) -> VideoConfig:
    instruction = request.instruction or "根据当前脚本推荐最适合短视频制作的视频参数"
    current = _json(request.currentConfig) if request.currentConfig else "无"
    result = await call_ai(
        f"""
任务：根据中文短视频脚本生成或修改视频制作参数。
脚本：{_json(request.script)}
当前参数：{current}
用户要求：{_clip(instruction, 600)}
仅返回 JSON：
{{"videoConfig":{{"ratio":"9:16 竖屏","duration":"30秒","style":"真实纪实","shotCount":"6个镜头"}}}}
要求：
1. ratio 只能是 9:16 竖屏、16:9 横屏、1:1 方形之一。
2. duration 必须是明确秒数或“90秒以上”。
3. style 必须是可执行的视频视觉与叙事风格，不要输出解释。
4. shotCount 必须是“数字+个镜头”，并与时长和脚本复杂度匹配。
""".strip()
    )
    config = TypeAdapter(VideoParameters).validate_python(result.get("videoConfig"))
    if request.instruction and request.currentConfig:
        current_parameters = request.currentConfig.model_dump(
            include={"ratio", "duration", "style", "shotCount"}
        )
        if config.model_dump() == current_parameters:
            raise ValueError("AI did not modify the video config")
    return VideoConfig(
        **config.model_dump(),
        source="chat" if request.instruction else "ai",
        instruction=request.instruction,
    )


async def generate_prompt(request: PromptRequest) -> list[Prompt]:
    instruction = request.instruction or "为每个已确认分镜生成图片和视频文本 Prompt"
    storyboard_rows = _dump(_prompt_storyboard_rows(request.storyboards))
    current_rows = _json(request.currentPrompts) if request.currentPrompts else "无"
    result = await call_ai(
        f"""
任务：把已经确认的 storyboard 转换为图片生成和视频生成模型可执行的 Prompt，不重新创作分镜内容，不调用媒体模型。
分镜字段：[id,shotNumber,duration,visualDescription,narration,shootingAdvice,imagePrompt,videoPrompt]
分镜数据：{storyboard_rows}
当前 Prompt 字段：[id,shotNumber,imagePrompt,videoPrompt.sceneDescription,videoPrompt.characterAction,videoPrompt.cameraMovement,videoPrompt.videoStyle,videoPrompt.timing,videoPrompt.fullPrompt]
当前 Prompt 数据：{current_rows}
要求：{_clip(instruction, 600)}
转换原则：
1. storyboard 是唯一的内容事实来源。保持每个镜头的核心主体、动作、场景、旁白和镜头意图，不改变核心内容，不增加剧情，不改写成新的故事。
2. 所有新增描述只能属于视觉表达层，用于让生成模型更容易执行，例如构图、景别、光线、镜头运动、画面节奏、材质表现、景深、视角和可见的画面组织方式。不得新增叙事层信息。
3. 禁止推导或添加 storyboard 中不存在的人物、人物身份或关系、地点、商业场景、新产品、新品牌、新事件、事件原因、品牌价值、用户反馈、购买意图、营销结论或其他事实。不得使用固定行业模板，也不得为了让画面更丰富而编造内容。
4. 如果 storyboard 没有提供某项事实，保持该项事实不变或使用中性的视觉表达，不要自行补全原因、背景故事、身份和结果。所有动作、页面变化和物体变化都必须能在当前 storyboard 中找到依据。

图片生成 Prompt：
5. imagePrompt 只转换当前镜头的单帧视觉信息，必须围绕已有内容具体说明：画面主体、主体当下的可见动作或状态、场景环境、构图关系、视觉焦点、景别、视角、光线、色彩/画面风格和材质表现。只写这一帧能被看见的内容，不写连续事件、人物关系、原因解释或营销文案。
6. 可以补充摄影语言和视觉表现方式，但补充必须服务当前 storyboard 的画面，不得改变主体、动作、场景或叙事事实。避免“展示产品”“突出差异”等无法直接生成的抽象短语，改写为具体可见的主体、位置、关系和画面状态。

视频生成 Prompt：
7. videoPrompt.sceneDescription 只描述当前镜头已有的场景和可见对象；videoPrompt.characterAction 只描述 storyboard 已有的主体动作或页面/物体变化；videoPrompt.cameraMovement 只描述与 storyboard 一致的景别、视角和镜头运动；videoPrompt.videoStyle 只描述当前镜头可执行的视觉风格、光线、材质和画面表现，不增加行业或营销语义。
8. videoPrompt.timing 必须把当前镜头组织成连续过程，明确开始状态、动作过程、镜头运动和结束状态；不能只写静态画面。例如不要只写“展示产品页面”，应写成“镜头从页面整体开始，逐渐推进到分镜已有的重点区域，已有页面元素发生分镜中描述的变化，最后停留在该重点区域”。示例中的变化只能来自当前 storyboard，不得自行添加。
9. videoPrompt.fullPrompt 必须整合上述视频字段，说明模型应该如何让当前镜头动起来，但不得添加新的剧情、人物、地点、事实、营销导向或叙事解释。

仅返回 JSON，不要 Markdown 或解释文字：
{{"prompts":[{{"id":"prompt-shot-1","shotNumber":1,"imagePrompt":"适合图片生成模型的文本","videoPrompt":{{"sceneDescription":"场景","characterAction":"人物动作","cameraMovement":"镜头运动","videoStyle":"风格","timing":"时间节奏","fullPrompt":"完整视频 Prompt"}}}}]}}
数量和 shotNumber 必须与输入 storyboard 一一对应，不能遗漏、合并或新增镜头；只能使用现有 JSON 字段。
""".strip()
    )
    prompts = TypeAdapter(list[Prompt]).validate_python(result.get("prompts"))
    if request.instruction and request.currentPrompts:
        def content(items: list[Prompt]) -> list[dict[str, Any]]:
            return [
                item.model_dump(exclude={"id"})
                for item in sorted(items, key=lambda value: value.shotNumber)
            ]

        if content(prompts) == content(request.currentPrompts):
            raise ValueError("AI did not modify the prompts")
    return prompts
