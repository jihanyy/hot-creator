from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from backend.ai_workflows import (
    CreativeRequest,
    HotspotContext as FullHotspotContext,
    HotspotRankingRequest,
    HotspotReasonRequest,
    ScriptRequest,
    generate_creative,
    generate_hotspot_ranking,
    generate_hotspot_reasons,
    generate_script,
)
from backend.hotspot_adapter import Hotspot


def HotspotContext(
    *, title: str, summary: str, **context: object
) -> FullHotspotContext:
    return FullHotspotContext(
        title=title,
        summary=summary,
        platform="微博",
        rank=1,
        hotScore=100,
        **context,
    )


class AIWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_creative_calls_shared_ai_service_and_validates_output(self) -> None:
        ai_result = {
            "creatives": [
                {
                    "id": f"creative-{index}",
                    "title": f"我们店展示标准 {index}",
                    "description": f"现场拍摄流程 {index}，展示门店证据，通过透明细节建立顾客信任。",
                }
                for index in range(1, 6)
            ]
        }
        request = CreativeRequest(
            hotspot=HotspotContext(
                title="某零食品牌称重争议",
                summary="消费者质疑重复称重和交易透明度。",
                matchedInterest="餐饮",
                relevanceScore=92,
                recommendationReasons=[
                    "该事件反映消费者对计量标准、价格透明和交易公平的关注。"
                ],
            ),
            interests=["餐饮"],
        )

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ) as mocked_call:
            creatives = await generate_creative(request)

        mocked_call.assert_awaited_once()
        prompt = mocked_call.await_args.args[0]
        self.assertEqual(len(creatives), 5)
        self.assertEqual(creatives[0].title, "我们店展示标准 1")
        self.assertIn("creatives 返回3-5项", prompt)
        self.assertIn("用户关注领域", prompt)
        self.assertIn("餐饮", prompt)
        self.assertIn("真正有意思、值得拍、彼此不同", prompt)
        self.assertIn("可以服务业务，也可以只是好看、好玩、有共鸣或有讨论价值", prompt)
        self.assertIn("不要求每条都介绍产品、服务或转化", prompt)
        self.assertIn("不得把未经证实的涉事品牌或个人当作主角", prompt)
        self.assertIn("recommendationReasons", prompt)
        self.assertIn("继承Step2的summary、matchedInterest和recommendationReasons", prompt)
        self.assertIn("该事件反映消费者对计量标准、价格透明和交易公平的关注", prompt)
        self.assertIn("热点为什么让人想看", prompt)
        self.assertIn("先回答“围绕这个热点最值得拍的内容是什么”", prompt)
        self.assertIn("先在内部发散出多于最终数量", prompt)
        self.assertIn("内容发散之后，再寻找用户行业与创意之间的自然连接", prompt)
        self.assertIn("不要强迫使用“拍摄”“展示”“下单”“顾客”“产品”“服务”等指定词", prompt)
        self.assertIn("Step2负责解释“为什么这个热点值得关注”", prompt)
        self.assertIn("同一批创意必须在思路上真正不同", prompt)
        self.assertNotIn("所有方案必须让老板或店员能够直接拍摄", prompt)
        self.assertNotIn("内容如何服务信任或到店/咨询/下单/复购", prompt)
        self.assertIn("Step3只输出创意概念，不写完整脚本", prompt)

    async def test_generate_creative_accepts_natural_executable_descriptions(self) -> None:
        request = CreativeRequest(
            hotspot=HotspotContext(title="游客消费需求变化", summary="游客关注住宿、餐饮和沟通体验。"),
            interests=["酒店民宿"],
        )
        descriptions = [
            "店员在民宿大堂双语接待游客，展示本地地图并引导扫码预订。",
            "厨师现场制作特色菜，游客品尝后给出真实评价。",
            "工作人员使用手机翻译软件与游客沟通，记录翻译界面和游客反应。",
            "店员介绍房型与周边景点，配合房间实景和 QR 码。",
        ]
        ai_result = {
            "creatives": [
                {
                    "id": f"creative-{index}",
                    "title": f"游客服务实拍方向 {index}",
                    "description": description,
                }
                for index, description in enumerate(descriptions, start=1)
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            creatives = await generate_creative(request)

        self.assertEqual(len(creatives), 4)
        self.assertEqual(
            [creative.description for creative in creatives],
            descriptions,
        )

    async def test_generate_creative_filters_invalid_items_and_keeps_valid_items(self) -> None:
        request = CreativeRequest(
            hotspot=HotspotContext(title="游客消费需求变化", summary="游客关注住宿体验。"),
            interests=["酒店民宿"],
        )
        ai_result = {
            "creatives": [
                {
                    "id": "creative-1",
                    "title": "前台接待的双语瞬间",
                    "description": "记录前台接待游客时的真实沟通和现场反应。",
                },
                {"id": "creative-2", "title": "缺少说明的创意"},
                {"id": "creative-3", "title": "另一条缺少说明的创意"},
                {"id": "creative-4", "title": "第三条缺少说明的创意"},
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "1 valid creative ideas"):
                await generate_creative(request)

        ai_result["creatives"] = [
            {
                "id": "creative-1",
                "title": "前台接待的双语瞬间",
                "description": "记录前台接待游客时的真实沟通和现场反应。",
            },
            {
                "id": "creative-2",
                "title": "房间整理前后",
                "description": "记录房间整理前后的变化，让观众观察细节如何影响入住体验。",
            },
            {
                "id": "creative-3",
                "title": "本地地图怎么选",
                "description": "在大堂对照地图和游客问题，记录一次现场路线选择。",
            },
            {"id": "creative-4", "title": "仍然缺少说明"},
        ]

        with self.assertLogs("uvicorn.error", level="INFO") as logs:
            with patch(
                "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
            ):
                creatives = await generate_creative(request)

        self.assertEqual(
            [creative.id for creative in creatives],
            ["creative-1", "creative-2", "creative-3"],
        )
        self.assertTrue(
            any(
                "AI returned 4 creatives, accepted 3, rejected 1" in message
                for message in logs.output
            )
        )

    async def test_generate_creative_rejects_obviously_generic_description(self) -> None:
        request = CreativeRequest(
            hotspot=HotspotContext(title="游客消费需求变化", summary="游客关注住宿体验。"),
            interests=["酒店民宿"],
        )
        ai_result = {
            "creatives": [
                {
                    "id": "creative-1",
                    "title": "游客服务现场记录",
                    "description": "结合热点做一期有价值的品牌内容，提升品牌影响力。",
                },
                {
                    "id": "creative-2",
                    "title": "前台接待流程",
                    "description": "店员在前台接待游客，展示入住流程并说明预订方式。",
                },
                {
                    "id": "creative-3",
                    "title": "房间服务体验",
                    "description": "店员在房间现场演示服务细节，让游客了解实际入住体验。",
                },
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(
                ValueError,
                "non-executable merchant creative idea",
            ):
                await generate_creative(request)

    async def test_generate_creative_rejects_duplicate_titles(self) -> None:
        request = CreativeRequest(
            hotspot=HotspotContext(title="测试热点", summary="测试摘要"),
            interests=["餐饮"],
        )
        ai_result = {
            "creatives": [
                {
                    "id": f"creative-{index}",
                    "title": "重复标题",
                    "description": f"不同说明 {index}",
                }
                for index in range(1, 4)
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "duplicate creative titles"):
                await generate_creative(request)

    async def test_generate_creative_uses_underlying_issue_for_self_media(self) -> None:
        request = CreativeRequest(
            hotspot=HotspotContext(title="平台热点争议", summary="用户正在讨论事件影响。"),
            interests=["自媒体"],
        )
        ai_result = {
            "creatives": [
                {
                    "id": f"creative-{index}",
                    "title": f"评论角度 {index}",
                    "description": f"传播与用户心理分析 {index}",
                }
                for index in range(1, 4)
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ) as mocked_call:
            await generate_creative(request)

        prompt = mocked_call.await_args.args[0]
        self.assertIn("用户选择了自媒体领域，可以在事实边界内进行事件解读", prompt)
        self.assertIn("不得杜撰事实、判断未经证实的责任", prompt)
        self.assertIn("如果用户选择自媒体，可以更自由地使用观点、事件解读、趋势", prompt)

    async def test_generate_creative_rejects_event_centered_output(self) -> None:
        request = CreativeRequest(
            hotspot=HotspotContext(title="测试热点", summary="测试摘要"),
            interests=["餐饮"],
        )
        ai_result = {
            "creatives": [
                {
                    "id": "creative-1",
                    "title": "热点复盘：事情到底怎么发生",
                    "description": "复述经过。",
                },
                {
                    "id": "creative-2",
                    "title": "餐饮透明经营",
                    "description": "展示门店标准。",
                },
                {
                    "id": "creative-3",
                    "title": "顾客判断方法",
                    "description": "提供用户教育。",
                },
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "event-centered creative idea"):
                await generate_creative(request)

    async def test_generate_creative_rejects_media_style_merchant_title(self) -> None:
        request = CreativeRequest(
            hotspot=HotspotContext(title="消费信任话题", summary="用户关注透明度。"),
            interests=["餐饮"],
        )
        ai_result = {
            "creatives": [
                {
                    "id": f"creative-{index}",
                    "title": (
                        "消费者应该如何判断餐厅是否透明"
                        if index == 1
                        else f"我们店公开检查流程 {index}"
                    ),
                    "description": "现场拍摄门店流程，展示检查记录，建立顾客信任。",
                }
                for index in range(1, 4)
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "media-style creative title"):
                await generate_creative(request)

    async def test_generate_script_uses_selected_creative_as_only_topic(self) -> None:
        request = ScriptRequest(
            hotspot=HotspotContext(
                title="酒店订单收入争议",
                summary="支付金额、平台结算和商家收入存在差异。",
            ),
            industry="酒店民宿",
            creativeIdea={
                    "id": "creative-hotel-cost",
                    "title": "我们把民宿经营成本直接拍给顾客看",
                    "description": "现场拍摄一笔订单的成本和交付过程，展示价格构成并建立预订信任。",
            },
            videoStyle="专业分析",
        )
        ai_result = {
            "scripts": [
                {
                    "id": "script-1",
                    "title": "一笔民宿订单拆成三层",
                    "hook": "订单总价不等于老板收入，先拆三层。",
                    "body": "第一层是顾客支付，第二层是平台和经营成本，第三层是客房与服务交付，逐项核对三者关系。",
                    "ending": "比较价格前，先把三层信息放在一起。",
                },
                {
                    "id": "script-2",
                    "title": "同样房价为何交付不同",
                    "hook": "两个房间价格一样，成本结构可能完全不同。",
                    "body": "对比清洁、布草、人力和平台费用，再核对入住时得到的服务，用横向数据解释差异。",
                    "ending": "总价相同，不代表服务结构相同。",
                },
                {
                    "id": "script-3",
                    "title": "预订前核对三张清单",
                    "hook": "判断一晚住宿值不值，只要核对三个问题。",
                    "body": "先核对费用包含项，再检查商家实际投入，最后验收房间和服务结果，形成完整判断步骤。",
                    "ending": "把清单对完，再决定是否预订。",
                },
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ) as mocked_call:
            scripts = await generate_script(request)

        prompt = mocked_call.await_args.args[0]
        self.assertEqual(len(scripts), 3)
        self.assertIn("热点洞察来源", prompt)
        self.assertIn("酒店订单收入争议", prompt)
        self.assertIn("用户行业：酒店民宿", prompt)
        self.assertIn("我们把民宿经营成本直接拍给顾客看", prompt)
        self.assertIn("视频风格：专业分析", prompt)
        self.assertIn("数据项、逻辑关系、步骤拆解", prompt)
        self.assertIn("四项都必须真实影响脚本", prompt)
        self.assertIn("标题不同，Hook 不同，正文核心逻辑和推进顺序不同", prompt)
        self.assertIn("不要输出热点解读、事件复盘、真相揭秘、新闻评论", prompt)
        self.assertIn("videoStyle 只是在生成时控制语气和节奏的内部参数", prompt)
        self.assertIn("风格已由工作流独立保存", prompt)
        self.assertIn("可以创造表达，但不能创造事实", prompt)
        self.assertIn("具体百分比、增长率、下降率、金额、人数", prompt)
        self.assertIn("不得自行生成", prompt)
        self.assertIn("研究显示", prompt)
        self.assertIn("数据显示", prompt)
        self.assertIn("实验表明", prompt)
        self.assertIn("研究机构、医院、大学、实验室、专家", prompt)
        self.assertIn("假设、示意、模拟或可选拍法", prompt)
        self.assertIn("专业感不等于堆数据、研究、专家、设备或术语", prompt)
        self.assertIn("事实不足时不要停止生成", prompt)
        self.assertIn("如果不能明确追溯到当前输入，就删除数字", prompt)
        self.assertIn("不确定时降低表述强度", prompt)
        self.assertIn("不调用外部搜索，不新增第二次 AI 审核", prompt)

    async def test_generate_script_changes_prompt_and_output_for_different_creatives(self) -> None:
        common = {
            "hotspot": HotspotContext(
                title="酒店订单收入讨论",
                summary="消费者关注价格构成和服务价值。",
            ),
            "industry": "酒店民宿",
            "videoStyle": "抽象创意",
            "instruction": "生成当前创意的可拍脚本",
        }
        cost_request = ScriptRequest(
            **common,
            creativeIdea={
                "id": "creative-cost",
                "title": "把一笔订单拆成桌面上的五个盒子",
                "description": "用盒子展示房费流向和经营成本。",
            },
        )
        service_request = ScriptRequest(
            **common,
            creativeIdea={
                "id": "creative-service",
                "title": "顾客进门后看到的五次服务交付",
                "description": "跟拍从到店到入住的五个服务瞬间。",
            },
        )
        ai_results = [
            {
                "scripts": [{
                    "id": "script-cost",
                    "title": "房费装进五个盒子后还剩多少",
                    "hook": "一笔房费落下，桌面五个盒子同时打开。",
                    "body": "老板把平台、清洁、布草、人力和客房交付分别放入五个盒子，用道具的占比呈现每项投入。",
                    "ending": "盒子装的不是概念，是今晚真正的交付。",
                }],
            },
            {
                "scripts": [{
                    "id": "script-service",
                    "title": "从进门到入住，顾客会经过五次服务",
                    "hook": "别先看房价，跟着这位顾客走完入住。",
                    "body": "镜头跟随顾客从指引、核验、房间检查到需求响应，每到一处就呈现一个具体服务动作。",
                    "ending": "价格是一个数字，入住体验是这五次真实发生。",
                }],
            },
        ]

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(side_effect=ai_results),
        ) as mocked_call:
            cost_scripts = await generate_script(cost_request)
            service_scripts = await generate_script(service_request)

        cost_prompt = mocked_call.await_args_list[0].args[0]
        service_prompt = mocked_call.await_args_list[1].args[0]
        self.assertNotEqual(cost_prompt, service_prompt)
        self.assertIn("creative-cost", cost_prompt)
        self.assertIn("把一笔订单拆成桌面上的五个盒子", cost_prompt)
        self.assertIn("creative-service", service_prompt)
        self.assertIn("顾客进门后看到的五次服务交付", service_prompt)
        for field in ("title", "hook", "body", "ending"):
            self.assertNotEqual(
                getattr(cost_scripts[0], field),
                getattr(service_scripts[0], field),
            )

    async def test_generate_script_rejects_news_oriented_output(self) -> None:
        request = ScriptRequest(
            hotspot=HotspotContext(title="来源标题", summary="来源摘要"),
            industry="餐饮",
            instruction="优化脚本",
            creativeIdea={
                    "id": "creative-1",
                    "title": "老板展示门店标准",
                    "description": "现场拍摄经营流程。",
            },
            videoStyle="专业分析",
        )
        ai_result = {
            "scripts": [
                {
                    "id": "script-1",
                    "title": "60秒看懂热点",
                    "hook": "先回顾新闻。",
                    "body": "复述经过。",
                    "ending": "欢迎评论。",
                }
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "news-oriented script"):
                await generate_script(request)

    async def test_generate_script_rejects_style_or_system_text(self) -> None:
        request = ScriptRequest(
            hotspot=HotspotContext(title="来源标题", summary="来源摘要"),
            industry="餐饮",
            instruction="优化脚本",
            creativeIdea={
                    "id": "creative-1",
                    "title": "老板展示门店标准",
                    "description": "现场拍摄经营流程。",
            },
            videoStyle="听AI推荐",
        )
        ai_result = {
            "scripts": [
                {
                    "id": "script-1",
                    "title": "老板展示门店标准",
                    "hook": "先看现场。",
                    "body": "整体采用『听AI推荐』表达，再展示门店记录。",
                    "ending": "欢迎到店确认。",
                }
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "system-oriented script text"):
                await generate_script(request)

    async def test_generate_script_rejects_extra_response_fields(self) -> None:
        request = ScriptRequest(
            hotspot=HotspotContext(title="来源标题", summary="来源摘要"),
            industry="餐饮",
            instruction="优化脚本",
            creativeIdea={
                    "id": "creative-1",
                    "title": "老板展示门店标准",
                    "description": "现场拍摄经营流程。",
            },
            videoStyle="专业分析",
        )
        ai_result = {
            "scripts": [
                {
                    "id": "script-1",
                    "title": "老板展示门店标准",
                    "hook": "先看现场。",
                    "body": "展示门店流程和真实记录。",
                    "ending": "欢迎到店确认。",
                    "style": "专业分析",
                }
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "unexpected script fields"):
                await generate_script(request)

    async def test_generate_script_rejects_three_scripts_with_same_core(self) -> None:
        request = ScriptRequest(
            hotspot=HotspotContext(title="价格话题", summary="顾客关注价格构成。"),
            industry="酒店民宿",
            creativeIdea={
                    "id": "creative-1",
                    "title": "拆解民宿经营成本",
                    "description": "说明订单价格、成本和服务价值。",
            },
            videoStyle="专业分析",
        )
        ai_result = {
            "scripts": [
                {
                    "id": f"script-{index}",
                    "title": f"不同标题 {index}",
                    "hook": f"不同开头 {index}",
                    "body": "把订单价格拆成成本、服务和交付三个步骤。",
                    "ending": f"不同结尾 {index}",
                }
                for index in range(1, 4)
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "duplicate script body"):
                await generate_script(request)

    async def test_generate_script_injects_distinct_style_mechanisms(self) -> None:
        expected_guides = {
            "情绪观点": "具体问题或冲突",
            "专业分析": "数据项、逻辑关系、步骤拆解",
            "故事叙述": "具体人物、场景推进、变化和情绪转折",
            "轻松幽默": "生活化误会、角色反差、节奏包袱",
            "知识科普": "概念区分、原因解释、常见误区",
            "反转剧情": "前后认知差、信息揭示或情境转折",
        }
        ai_result = {
            "scripts": [
                {
                    "id": "script-1",
                    "title": "民宿价格与服务",
                    "hook": "先看一笔订单。",
                    "body": "房费对应房间、清洁和入住服务，每一项都能核对。",
                    "ending": "看完具体交付再做选择。",
                }
            ]
        }

        for style, marker in expected_guides.items():
            with self.subTest(style=style):
                request = ScriptRequest(
                    hotspot=HotspotContext(
                        title="酒店订单收入讨论",
                        summary="消费者关注价格与服务价值。",
                    ),
                    industry="酒店民宿",
                    instruction="根据补充意见修改",
                    creativeIdea={
                            "id": "creative-1",
                            "title": "顾客付的钱在店里能看到什么",
                            "description": "解释价格对应的房间与服务。",
                    },
                    videoStyle=style,
                )
                with patch(
                    "backend.ai_workflows.call_ai",
                    AsyncMock(return_value=ai_result),
                ) as mocked_call:
                    await generate_script(request)

                prompt = mocked_call.await_args.args[0]
                self.assertIn(f"视频风格：{style}", prompt)
                self.assertIn(marker, prompt)

    async def test_generate_script_revision_must_replace_all_content_fields(self) -> None:
        current_script = {
            "id": "script-current",
            "title": "原始标题",
            "hook": "原始开头",
            "body": "原始正文",
            "ending": "原始结尾",
        }
        request = ScriptRequest(
            hotspot=HotspotContext(title="来源标题", summary="来源摘要"),
            industry="酒店民宿",
            instruction="改成适合AI生成的视频风格",
            currentScript=current_script,
            creativeIdea={
                    "id": "creative-1",
                    "title": "拆解一笔订单",
                    "description": "把价格和服务变成可视化内容。",
            },
            videoStyle="抽象创意",
        )
        ai_result = {
            "scripts": [
                {
                    **current_script,
                    "id": "script-modified",
                    "title": "只修改了标题",
                }
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            with self.assertRaisesRegex(ValueError, "did not modify script hook"):
                await generate_script(request)

    async def test_hotspot_ranking_uses_domain_business_and_creation_criteria(self) -> None:
        request = HotspotRankingRequest(
            interests=["电商零售"],
            hotspots=[
                Hotspot(
                    title="电商平台商品价格调整",
                    summary="消费趋势变化带来新的品牌营销机会。",
                    platform="抖音",
                    rank=8,
                    hotScore=500_000,
                )
            ],
        )
        ai_result = {
            "assessments": [
                {
                    "index": 0,
                    "relevance": 95,
                    "businessValue": 90,
                    "creativeValue": 92,
                }
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ) as mocked_call:
            assessments = await generate_hotspot_ranking(request)

        prompt = mocked_call.await_args.args[0]
        self.assertEqual(assessments[0].relevance, 95)
        self.assertIn("商品、消费趋势、电商平台、品牌营销", prompt)
        self.assertIn("无关社会新闻必须低于20", prompt)
        self.assertIn("必须先在内部完成语义与行业传导判断，再评分", prompt)
        self.assertIn("直接相关、间接相关、弱相关或无关", prompt)
        self.assertIn("关键词只能作为辅助信号", prompt)
        self.assertIn("至少一个领域成立", prompt)
        self.assertIn("不要为了凑推荐数量强行给到20以上", prompt)
        self.assertIn("本阶段只评分", prompt)
        self.assertNotIn('"reason"', prompt)

    async def test_hotspot_ranking_accepts_partial_and_empty_assessments(self) -> None:
        request = HotspotRankingRequest(
            interests=["电商零售"],
            hotspots=[
                Hotspot(
                    title=f"候选热点 {index}",
                    summary="候选摘要",
                    platform="抖音",
                    rank=index + 1,
                    hotScore=100_000 - index,
                )
                for index in range(3)
            ],
        )

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(
                return_value={
                    "assessments": [
                        {
                            "index": 0,
                            "relevance": 80,
                            "businessValue": 70,
                            "creativeValue": 60,
                        },
                        {
                            "index": 1,
                            "relevance": 50,
                            "businessValue": 40,
                            "creativeValue": 30,
                        },
                    ]
                }
            ),
        ):
            partial_assessments = await generate_hotspot_ranking(request)

        self.assertEqual([item.index for item in partial_assessments], [0, 1])

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(return_value={"assessments": []}),
        ):
            empty_assessments = await generate_hotspot_ranking(request)

        self.assertEqual(empty_assessments, [])

    async def test_hotspot_ranking_rejects_assessment_index_outside_candidates(self) -> None:
        request = HotspotRankingRequest(
            interests=["电商零售"],
            hotspots=[
                Hotspot(
                    title="候选热点",
                    summary="候选摘要",
                    platform="抖音",
                    rank=1,
                    hotScore=100_000,
                )
            ],
        )

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(
                return_value={
                    "assessments": [
                        {
                            "index": 1,
                            "relevance": 80,
                            "businessValue": 70,
                            "creativeValue": 60,
                        }
                    ]
                }
            ),
        ):
            with self.assertRaisesRegex(ValueError, "invalid hotspot assessment index"):
                await generate_hotspot_ranking(request)

    async def test_hotspot_ranking_normalizes_relevance_alias_and_score_strings(self) -> None:
        request = HotspotRankingRequest(
            interests=["餐饮"],
            hotspots=[
                Hotspot(
                    title="餐饮消费热点",
                    summary="消费者关注门店价格透明。",
                    platform="微博",
                    rank=1,
                    hotScore=100_000,
                )
            ],
        )
        ai_result = {
            "assessments": [
                {
                    "index": 0,
                    "relevance_score": "35%",
                    "businessValue": "60",
                    "creativeValue": 75,
                }
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ):
            assessments = await generate_hotspot_ranking(request)

        self.assertEqual(assessments[0].relevance, 35)
        self.assertEqual(assessments[0].businessValue, 60)
        self.assertEqual(assessments[0].creativeValue, 75)
        self.assertIsInstance(assessments[0].relevance, int)

    async def test_hotspot_reasons_only_explain_final_displayed_hotspots(self) -> None:
        request = HotspotReasonRequest(
            interests=["电商零售"],
            hotspots=[
                {
                    "index": 0,
                    "title": "电商平台商品价格调整",
                    "summary": "消费趋势变化带来品牌营销机会。",
                    "relevance": 95,
                    "businessValue": 90,
                    "creativeValue": 92,
                    "finalScore": 88,
                }
            ],
        )
        ai_result = {
            "reasons": [
                {
                    "index": 0,
                    "reason": "价格变化可转化为消费趋势和品牌经营选题。",
                }
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=ai_result)
        ) as mocked_call:
            reasons = await generate_hotspot_reasons(request)

        prompt = mocked_call.await_args.args[0]
        self.assertEqual(len(reasons), 1)
        self.assertIn("只为最终展示的热点", prompt)
        self.assertIn("为什么这个热点适合该领域用户创作", prompt)
        self.assertIn("电商平台商品价格调整", prompt)
        self.assertIn("热点真正反映了什么变化或矛盾", prompt)
        self.assertIn("消费者或市场信号", prompt)
        self.assertIn("对具体领域的影响路径", prompt)
        self.assertIn("不要输出具体拍法、创意标题、镜头、脚本", prompt)

    async def test_hotspot_reasons_accept_partial_and_empty_results(self) -> None:
        request = HotspotReasonRequest(
            interests=["电商零售"],
            hotspots=[
                {
                    "index": index,
                    "title": f"候选热点 {index}",
                    "summary": "消费趋势变化。",
                    "relevance": 90,
                    "businessValue": 80,
                    "creativeValue": 70,
                    "finalScore": 85,
                }
                for index in range(7)
            ],
        )
        partial_result = {
            "reasons": [
                {
                    "index": index,
                    "reason": f"热点 {index} 与所选领域存在明确的消费变化和内容关联。",
                }
                for index in range(6)
            ]
        }

        with patch(
            "backend.ai_workflows.call_ai", AsyncMock(return_value=partial_result)
        ):
            reasons = await generate_hotspot_reasons(request)

        self.assertEqual([item.index for item in reasons], list(range(6)))

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(return_value={"reasons": []}),
        ):
            empty_reasons = await generate_hotspot_reasons(request)

        self.assertEqual(empty_reasons, [])

    async def test_hotspot_reasons_reject_invalid_index(self) -> None:
        request = HotspotReasonRequest(
            interests=["电商零售"],
            hotspots=[
                {
                    "index": 0,
                    "title": "候选热点",
                    "summary": "消费趋势变化。",
                    "relevance": 90,
                    "businessValue": 80,
                    "creativeValue": 70,
                    "finalScore": 85,
                }
            ],
        )

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(
                return_value={
                    "reasons": [
                        {
                            "index": 1,
                            "reason": "错误关联到不存在的热点。",
                        }
                    ]
                }
            ),
        ):
            with self.assertRaisesRegex(ValueError, "invalid hotspot reason index"):
                await generate_hotspot_reasons(request)


if __name__ == "__main__":
    unittest.main()
