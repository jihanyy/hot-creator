from __future__ import annotations

import time
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import backend.main as backend
from backend.hotspot_adapter import Hotspot


class AIPipelineTests(unittest.TestCase):
    def test_step2_to_step7_backend_pipeline(self) -> None:
        hotspot = Hotspot(
            title="Test trend",
            summary="A trend selected in Step2",
            platform="\u5fae\u535a",
            rank=1,
            hotScore=100,
        )
        creative_result = {
            "creatives": [
                {
                    "id": f"creative-{index}",
                    "title": f"Our shop shows proof {index}",
                    "description": "现场拍摄经营流程，展示门店证据，建立顾客信任并促进到店。",
                }
                for index in range(1, 4)
            ]
        }
        ranking_result = {
            "assessments": [
                {
                    "index": 0,
                    "relevance": 95,
                    "businessValue": 90,
                    "creativeValue": 92,
                }
            ]
        }
        reason_result = {
            "reasons": [
                {
                    "index": 0,
                    "reason": "This trend is directly usable by the selected domain.",
                }
            ]
        }
        script_result = {
            "scripts": [
                {
                    "id": "script-1",
                    "title": "Test script",
                    "hook": "Opening hook",
                    "body": "Script body",
                    "ending": "Closing line",
                },
                {
                    "id": "script-2",
                    "title": "Comparison script",
                    "hook": "A different opening question",
                    "body": "Compare two operating choices and verify their different outcomes.",
                    "ending": "Choose after comparing the evidence.",
                },
                {
                    "id": "script-3",
                    "title": "Customer story",
                    "hook": "A customer changed their mind yesterday",
                    "body": "A person entered with doubts, checked the service in person, and reached a new conclusion.",
                    "ending": "The decision came from experience rather than persuasion.",
                },
            ]
        }
        storyboard_result = {
            "storyboards": [
                {
                    "id": "shot-1",
                    "shotNumber": 1,
                    "duration": "5s",
                    "visualDescription": "Test visual",
                    "narration": "Test narration",
                    "shootingAdvice": "Static medium shot",
                    "imagePrompt": "Test image prompt",
                    "videoPrompt": "Test video prompt",
                }
            ]
        }
        prompt_result = {
            "prompts": [
                {
                    "id": "prompt-shot-1",
                    "shotNumber": 1,
                    "imagePrompt": "Final image prompt",
                    "videoPrompt": {
                        "sceneDescription": "Test scene",
                        "characterAction": "Test action",
                        "cameraMovement": "Static camera",
                        "videoStyle": "Documentary",
                        "timing": "0-5s",
                        "fullPrompt": "Final video prompt",
                    },
                }
            ]
        }
        video_config = {
            "ratio": "9:16",
            "duration": "30s",
            "style": "Documentary",
            "shotCount": "1",
            "source": "AI",
        }

        previous_hotspots = backend._cached_hotspots
        previous_expiration = backend._cache_expires_at
        backend._cached_hotspots = [hotspot]
        backend._cache_expires_at = time.monotonic() + 60
        mocked_ai = AsyncMock(
            side_effect=[
                ranking_result,
                reason_result,
                creative_result,
                script_result,
                storyboard_result,
                prompt_result,
            ]
        )

        try:
            with (
                patch("backend.ai_workflows.call_ai", mocked_ai),
                TestClient(backend.app) as client,
            ):
                # Step2: score all candidates, then explain only displayed items.
                hotspot_response = client.get("/api/hotspots")
                self.assertEqual(hotspot_response.status_code, 200)
                selected_hotspot = hotspot_response.json()[0]
                ranking_response = client.post(
                    "/api/ai/hotspot-ranking",
                    json={
                        "interests": ["E-commerce"],
                        "hotspots": [selected_hotspot],
                    },
                )
                self.assertEqual(ranking_response.status_code, 200)
                assessment = ranking_response.json()[0]
                self.assertNotIn("reason", assessment)
                reason_response = client.post(
                    "/api/ai/hotspot-reasons",
                    json={
                        "interests": ["E-commerce"],
                        "hotspots": [
                            {
                                "index": 0,
                                "title": selected_hotspot["title"],
                                "summary": selected_hotspot["summary"],
                                "relevance": assessment["relevance"],
                                "businessValue": assessment["businessValue"],
                                "creativeValue": assessment["creativeValue"],
                                "finalScore": 88,
                            }
                        ],
                    },
                )
                self.assertEqual(reason_response.status_code, 200)

                # Step3: generate a creative.
                creative_response = client.post(
                    "/api/ai/creative",
                    json={
                        "hotspot": selected_hotspot,
                        "interests": ["E-commerce"],
                        "batchIndex": 0,
                    },
                )
                self.assertEqual(creative_response.status_code, 200)
                selected_creative = creative_response.json()[0]

                # Step4: generate a script.
                script_response = client.post(
                    "/api/ai/script",
                    json={
                        "hotspot": selected_hotspot,
                        "industry": "E-commerce",
                        "creativeIdea": selected_creative,
                        "videoStyle": "Documentary",
                    },
                )
                self.assertEqual(script_response.status_code, 200)
                selected_script = script_response.json()[0]

                # Step6: generate a storyboard.
                storyboard_response = client.post(
                    "/api/ai/storyboard",
                    json={
                        "script": selected_script,
                        "videoConfig": {
                            "ratio": video_config["ratio"],
                            "duration": video_config["duration"],
                            "style": video_config["style"],
                            "shotCount": video_config["shotCount"],
                        },
                        "batchIndex": 0,
                    },
                )
                self.assertEqual(storyboard_response.status_code, 200)
                storyboards = storyboard_response.json()

                # Step7: generate image and video text prompts.
                prompt_response = client.post(
                    "/api/ai/prompt",
                    json={
                        "storyboards": storyboards,
                    },
                )
                self.assertEqual(prompt_response.status_code, 200)
                self.assertEqual(
                    prompt_response.json()[0]["videoPrompt"]["fullPrompt"],
                    "Final video prompt",
                )
        finally:
            backend._cached_hotspots = previous_hotspots
            backend._cache_expires_at = previous_expiration

        self.assertEqual(mocked_ai.await_count, 6)
        storyboard_prompt = mocked_ai.await_args_list[4].args[0]
        final_prompt = mocked_ai.await_args_list[5].args[0]
        self.assertNotIn("Test trend", storyboard_prompt)
        self.assertNotIn("Test creative", storyboard_prompt)
        self.assertIn("Script body", storyboard_prompt)
        self.assertIn("script-1", storyboard_prompt)
        self.assertIn("Test narration", final_prompt)
        self.assertIn("shot-1", final_prompt)
        self.assertNotIn("Documentary", final_prompt)


if __name__ == "__main__":
    unittest.main()
