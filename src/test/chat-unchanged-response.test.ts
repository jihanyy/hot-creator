import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateCreative,
  generatePrompt,
  generateStoryboard,
  generateVideoConfig,
} from '../services/api'
import type {
  Creative,
  Hotspot,
  Prompt,
  Script,
  Storyboard,
  VideoConfig,
} from '../types/workflow'

const hotspot: Hotspot = {
  title: '测试热点',
  summary: '测试摘要',
  platform: '微博',
  rank: 1,
  hotScore: 100,
  matchedInterest: '酒店民宿',
}
const script: Script = {
  id: 'script-1',
  title: '测试脚本',
  hook: '测试 Hook',
  body: '测试正文',
  ending: '测试结尾',
}
const config: VideoConfig = {
  ratio: '9:16 竖屏',
  duration: '30秒',
  style: '真实纪实',
  shotCount: '5个镜头',
  source: 'manual',
}
const storyboard: Storyboard = {
  id: 'shot-1',
  shotNumber: 1,
  duration: '3秒',
  visualDescription: '测试画面',
  narration: '测试旁白',
  shootingAdvice: '测试运镜',
  imagePrompt: '测试图片 Prompt',
  videoPrompt: '测试视频 Prompt',
}
const prompt: Prompt = {
  id: 'prompt-1',
  shotNumber: 1,
  imagePrompt: '测试图片 Prompt',
  videoPrompt: {
    sceneDescription: '测试场景',
    characterAction: '测试动作',
    cameraMovement: '测试运镜',
    videoStyle: '测试风格',
    timing: '0-3秒',
    fullPrompt: '测试完整 Prompt',
  },
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('聊天修改禁止假成功', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Step3 原样返回创意时报错', async () => {
    const current: Creative[] = [1, 2, 3].map((index) => ({
      id: `idea-${index}`,
      title: `创意 ${index}`,
      description: `创意说明 ${index}`,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(current)))

    await expect(generateCreative(
      hotspot,
      [{ id: 'hotel', name: '酒店民宿' }],
      0,
      '更幽默',
      current,
    )).rejects.toMatchObject({ code: 'unchanged_response' })
  })

  it('Step5 只改响应元数据时报错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      ...config,
      source: 'chat',
      instruction: '更幽默',
    })))

    await expect(generateVideoConfig(script, '更幽默', config))
      .rejects.toMatchObject({ code: 'unchanged_response' })
  })

  it('Step6 只改分镜 id 时报错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{
      ...storyboard,
      id: 'new-id-only',
    }])))

    await expect(generateStoryboard(
      script,
      config,
      0,
      '更幽默',
      [storyboard],
    )).rejects.toMatchObject({ code: 'unchanged_response' })
  })

  it('Step7 只改 Prompt id 时报错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{
      ...prompt,
      id: 'new-id-only',
    }])))

    await expect(generatePrompt(
      [storyboard],
      config,
      '更幽默',
      [prompt],
    )).rejects.toMatchObject({ code: 'unchanged_response' })
  })
})
