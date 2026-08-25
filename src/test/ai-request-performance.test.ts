import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateCreative,
  generatePrompt,
  generateScript,
  generateStoryboard,
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
  title: '测试热点',
  summary: '测试摘要',
  platform: '微博',
  rank: 1,
  hotScore: 100,
  matchedInterest: '餐饮',
}

const interests: Interest[] = [{ id: 'restaurant', name: '餐饮' }]

const creativeSelection: CreativeSelection = {
  hotspot,
  industry: '餐饮',
  idea: {
    id: 'creative-test',
    title: '测试创意',
    description: '测试创意说明',
  },
  videoStyle: '专业分析',
}

const script: Script = {
  id: 'script-test',
  title: '测试脚本',
  hook: '测试 Hook',
  body: '测试正文',
  ending: '测试结尾',
}

const videoConfig: VideoConfig = {
  ratio: '9:16',
  duration: '30秒',
  style: '专业分析',
  shotCount: '1个镜头',
  source: 'manual',
}

const storyboard: Storyboard = {
  id: 'shot-1',
  shotNumber: 1,
  duration: '3秒',
  visualDescription: '测试画面',
  narration: '测试旁白',
  shootingAdvice: '缓慢推进',
  imagePrompt: '测试图片方向',
  videoPrompt: '测试视频方向',
}

describe('AI 请求性能与降级', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('合并完全相同的并发分镜请求', async () => {
    let resolveResponse: (response: Response) => void = () => undefined
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(responsePromise)
    vi.stubGlobal('fetch', fetchMock)

    const firstRequest = generateStoryboard(script, videoConfig)
    const secondRequest = generateStoryboard(script, videoConfig)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(requestBody).toEqual({
      script,
      videoConfig: {
        ratio: videoConfig.ratio,
        duration: videoConfig.duration,
        style: videoConfig.style,
        shotCount: videoConfig.shotCount,
      },
      batchIndex: 0,
    })
    resolveResponse(
      new Response(JSON.stringify([storyboard]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest])
    expect(firstResult).toEqual([storyboard])
    expect(secondResult).toEqual([storyboard])
  })

  it('Prompt 请求失败时抛出错误，不返回 Mock fallback', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generatePrompt([storyboard], videoConfig)).rejects.toThrow(
      'AI服务暂时不可用，请稍后重试',
    )
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(requestBody).toEqual({
      storyboards: [
        {
          ...storyboard,
        },
      ],
    })
  })

  it('Step3 传递完整热点，Step4 传递完整选择契约', async () => {
    const creative = creativeSelection.idea
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([creative]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ ...script, style: '听AI推荐', explanation: '生成说明' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await generateCreative(hotspot, interests)
    const parsedScripts = await generateScript(creativeSelection, '增加具体数据拆解')

    const creativeBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    const scriptBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(creativeBody.hotspot).toEqual(hotspot)
    expect(creativeBody.interests).toEqual(['餐饮'])
    expect(scriptBody.hotspot).toEqual(hotspot)
    expect(scriptBody.industry).toBe('餐饮')
    expect(scriptBody.creativeIdea).toEqual(creativeSelection.idea)
    expect(scriptBody.videoStyle).toBe(creativeSelection.videoStyle)
    expect(scriptBody).not.toHaveProperty('creativeSelection')
    expect(scriptBody.instruction).toBe('增加具体数据拆解')
    expect(creativeBody.hotspot.platform).toBe('微博')
    expect(scriptBody.hotspot.matchedInterest).toBe('餐饮')
    expect(parsedScripts).toEqual([script])
    expect(parsedScripts[0]).not.toHaveProperty('style')
    expect(parsedScripts[0]).not.toHaveProperty('explanation')
  })

  it('Step4 修改响应未覆盖四字段时返回错误，不伪造改写结果', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([script]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateScript(
        creativeSelection,
        '改成适合AI生成的视频风格',
        script,
      ),
    ).rejects.toThrow('AI 未返回完整修改结果，请重试。')
  })
})
