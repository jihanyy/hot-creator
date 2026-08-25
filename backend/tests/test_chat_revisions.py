from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from backend.ai_workflows import (
    CreativeRequest,
    HotspotContext,
    PromptRequest,
    StoryboardRequest,
    VideoConfigRequest,
    generate_creative,
    generate_prompt,
    generate_storyboard,
    generate_video_config,
)


HOTSPOT = {
    "title": "酒店订单收入讨论",
    "summary": "消费者关注价格、平台费用和服务价值。",
    "platform": "微博",
    "rank": 1,
    "hotScore": 900_000,
    "matchedInterest": "酒店民宿",
}

SCRIPT = {
    "id": "script-current",
    "title": "一笔订单怎么拆",
    "hook": "订单总价不等于商家收入。",
    "body": "逐项展示清洁、布草、人力和入住服务。",
    "ending": "把价格和交付放在一起看。",
}

VIDEO_CONFIG = {
    "ratio": "9:16 竖屏",
    "duration": "30秒",
    "style": "真实纪实",
    "shotCount": "5个镜头",
    "source": "manual",
}

STORYBOARD = {
    "id": "shot-current",
    "shotNumber": 1,
    "duration": "3秒",
    "visualDescription": "老板展示订单明细。",
    "narration": "这是顾客支付的总价。",
    "shootingAdvice": "竖屏近景。",
    "imagePrompt": "真实民宿前台与订单。",
    "videoPrompt": "老板指向订单费用项。",
}

PROMPT = {
    "id": "prompt-current",
    "shotNumber": 1,
    "imagePrompt": "民宿前台，老板手持订单。",
    "videoPrompt": {
        "sceneDescription": "民宿前台。",
        "characterAction": "老板展示订单。",
        "cameraMovement": "缓慢推近。",
        "videoStyle": "真实纪实。",
        "timing": "0-3秒。",
        "fullPrompt": "民宿前台近景，老板展示订单，镜头缓慢推近。",
    },
}


class ChatRevisionWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_creative_revision_receives_complete_current_creatives(self) -> None:
        current = [
            {
                "id": f"idea-{index}",
                "title": f"我们店展示当前方案 {index}",
                "description": f"实拍门店现场，展示服务细节，建立顾客信任 {index}。",
            }
            for index in range(1, 4)
        ]
        revised = [
            {
                "id": f"funny-{index}",
                "title": f"我们店的成本盒子开会了 {index}",
                "description": f"实拍老板与拟人道具的幽默现场，展示费用与服务交付，促进顾客选择 {index}。",
            }
            for index in range(1, 4)
        ]
        request = CreativeRequest(
            hotspot=HotspotContext(**HOTSPOT),
            interests=["酒店民宿"],
            instruction="更幽默",
            currentCreatives=current,
        )

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(return_value={"creatives": revised}),
        ) as mocked_call:
            result = await generate_creative(request)

        ai_prompt = mocked_call.await_args.args[0]
        self.assertIn("当前创意完整数据", ai_prompt)
        self.assertIn("我们店展示当前方案 1", ai_prompt)
        self.assertIn("更幽默", ai_prompt)
        self.assertEqual(result[0].id, "funny-1")

    async def test_video_config_revision_receives_complete_script_and_config(self) -> None:
        request = VideoConfigRequest(
            script=SCRIPT,
            instruction="更幽默",
            currentConfig=VIDEO_CONFIG,
        )
        revised = {
            "ratio": "9:16 竖屏",
            "duration": "35秒",
            "style": "幽默角色反差",
            "shotCount": "6个镜头",
        }

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(return_value={"videoConfig": revised}),
        ) as mocked_call:
            result = await generate_video_config(request)

        ai_prompt = mocked_call.await_args.args[0]
        self.assertIn("script-current", ai_prompt)
        self.assertIn('"source":"manual"', ai_prompt)
        self.assertEqual(result.style, "幽默角色反差")
        self.assertEqual(result.source, "chat")

    async def test_storyboard_revision_updates_content_and_rejects_unchanged_data(self) -> None:
        request = StoryboardRequest(
            script=SCRIPT,
            videoConfig={key: VIDEO_CONFIG[key] for key in (
                "ratio", "duration", "style", "shotCount"
            )},
            instruction="更幽默",
            currentStoryboards=[STORYBOARD],
        )
        revised = {
            **STORYBOARD,
            "id": "shot-funny",
            "visualDescription": "老板拿出五个拟人化费用盒子。",
            "narration": "房费还没坐稳，成本已经开始排队。",
        }

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(return_value={"storyboards": [revised]}),
        ) as mocked_call:
            result = await generate_storyboard(request)

        ai_prompt = mocked_call.await_args.args[0]
        self.assertIn("script-current", ai_prompt)
        self.assertIn("shot-current", ai_prompt)
        self.assertEqual(result[0].narration, revised["narration"])

        unchanged_with_new_id = {**STORYBOARD, "id": "new-id-only"}
        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(return_value={"storyboards": [unchanged_with_new_id]}),
        ):
            with self.assertRaisesRegex(ValueError, "did not modify the storyboards"):
                await generate_storyboard(request)

    async def test_prompt_revision_receives_complete_storyboard_and_current_prompt(self) -> None:
        request = PromptRequest(
            storyboards=[STORYBOARD],
            instruction="更幽默",
            currentPrompts=[PROMPT],
        )
        revised = {
            **PROMPT,
            "id": "prompt-funny",
            "imagePrompt": "民宿前台，拟人化费用盒子排队。",
            "videoPrompt": {
                **PROMPT["videoPrompt"],
                "characterAction": "老板追着逃跑的清洁费盒子。",
                "fullPrompt": "民宿前台轻喜剧，老板与费用盒子幽默互动。",
            },
        }

        with patch(
            "backend.ai_workflows.call_ai",
            AsyncMock(return_value={"prompts": [revised]}),
        ) as mocked_call:
            result = await generate_prompt(request)

        ai_prompt = mocked_call.await_args.args[0]
        self.assertIn("shot-current", ai_prompt)
        self.assertIn("prompt-current", ai_prompt)
        self.assertIn(PROMPT["videoPrompt"]["fullPrompt"], ai_prompt)
        self.assertEqual(result[0].id, "prompt-funny")


if __name__ == "__main__":
    unittest.main()
