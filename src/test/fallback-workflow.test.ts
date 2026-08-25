import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateCreative,
  generatePrompt,
  generateScript,
  generateStoryboard,
  generateVideoConfig,
} from '../services/api'
import type {
  CreativeSelection,
  Hotspot,
  Interest,
  Script,
  Storyboard,
  VideoConfig,
} from '../types/workflow'

const hotspot: Hotspot = {
  title: '酒店订单收入争议',
  summary: '消费者支付金额、平台结算和商家实际到手收入存在明显差异。',
  platform: '微博',
  rank: 1,
  hotScore: 980_000,
  matchedInterest: '酒店民宿',
}
const interests: Interest[] = [{ id: 'hotel', name: '酒店民宿' }]
const creativeSelection: CreativeSelection = {
  hotspot,
  industry: '酒店民宿',
  idea: {
    id: 'idea-1',
    title: '我们把民宿经营成本直接拍给顾客看',
    description: '现场展示订单价格、经营投入与服务交付。',
  },
  videoStyle: '专业分析',
}
const script: Script = {
  id: 'script-1',
  title: '一笔订单怎么拆',
  hook: '订单总价不等于商家收入。',
  body: '展示平台费用、清洁、布草、人力和入住服务。',
  ending: '把价格和交付放在一起看。',
}
const videoConfig: VideoConfig = {
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
  visualDescription: '老板展示订单明细。',
  narration: '订单总价不等于商家收入。',
  shootingAdvice: '竖屏近景。',
  imagePrompt: '真实门店，订单明细。',
  videoPrompt: '老板逐项展示订单费用。',
}

describe('生产 AI 失败行为', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Step3-Step7 与视频参数接口失败时全部抛出错误，不返回 Mock 内容', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            status: 'error',
            code: 'rate_limited',
            message: 'AI 服务当前请求受限，请稍后重试。',
          },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateCreative(hotspot, interests)).rejects.toMatchObject({
      status: 503,
      code: 'rate_limited',
    })
    await expect(generateScript(creativeSelection)).rejects.toMatchObject({
      status: 503,
    })
    await expect(generateVideoConfig(script)).rejects.toMatchObject({ status: 503 })
    await expect(
      generateStoryboard(script, videoConfig),
    ).rejects.toMatchObject({ status: 503 })
    await expect(generatePrompt([storyboard], videoConfig)).rejects.toMatchObject({
      status: 503,
    })

    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
