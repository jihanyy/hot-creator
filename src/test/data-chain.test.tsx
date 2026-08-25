import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreativeSuggestions from '../components/CreativeSuggestions'
import type { Creative, CreativeSelection, Hotspot } from '../types/workflow'

const hotspot: Hotspot = {
  title: '酒店订单收入讨论',
  summary: '消费者关注价格、平台费用和服务价值。',
  platform: '微博',
  rank: 1,
  hotScore: 900_000,
  recommendationIndex: 87,
  relevanceScore: 92,
  businessValueScore: 88,
  creativeValueScore: 86,
  matchedInterest: '酒店民宿',
  recommendationReasons: ['可用价格透明和服务交付回应消费者关注。'],
}

const idea: Creative = {
  id: 'creative-cost-view',
  title: '顾客付的钱，在我们店能看到什么',
  description: '把订单价格对应的房间、清洁和入住服务逐项拍出来。',
}

describe('Step3-Step7 数据链路', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Step3 选择创意时保存完整热点、行业、创意和预设脚本风格', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([idea]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const onSelectCreative = vi.fn<(selection: CreativeSelection) => void>()

    render(
      <CreativeSuggestions
        hotspot={hotspot}
        interests={[{ id: 'hotel', name: '酒店民宿' }]}
        onBack={vi.fn()}
        onIdeasChange={vi.fn()}
        onSelectCreative={onSelectCreative}
      />,
    )

    await waitFor(() => expect(screen.getByText(idea.title)).toBeTruthy())
    expect(screen.getByRole('button', { name: /听AI推荐/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '轻松幽默' }))
    fireEvent.click(screen.getByRole('button', { name: '选择这个创意' }))

    expect(onSelectCreative).toHaveBeenCalledWith({
      hotspot,
      industry: '酒店民宿',
      idea,
      videoStyle: '轻松幽默',
    })
  })

  it('自定义脚本风格原位输入并传给 Step4，不重新生成 Step3 创意', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([idea]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSelectCreative = vi.fn<(selection: CreativeSelection) => void>()

    const { container } = render(
      <CreativeSuggestions
        hotspot={hotspot}
        interests={[{ id: 'hotel', name: '酒店民宿' }]}
        onBack={vi.fn()}
        onIdeasChange={vi.fn()}
        onSelectCreative={onSelectCreative}
      />,
    )

    await waitFor(() => expect(screen.getByText(idea.title)).toBeTruthy())
    const styleButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.video-style-options button'),
    ).map((button) => button.textContent?.trim())
    expect(styleButtons).toEqual([
      '专业分析',
      '轻松幽默',
      '故事叙述',
      '情绪观点',
      '知识科普',
      '反转剧情',
      '✦听AI推荐',
      '自定义',
    ])

    fireEvent.click(screen.getByRole('button', { name: '自定义' }))
    expect(container.querySelectorAll('.video-style-options')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '自定义' })).toBeNull()
    fireEvent.change(screen.getByLabelText('自定义脚本风格'), {
      target: { value: '纪录片风格' },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '选择这个创意' }))
    expect(onSelectCreative).toHaveBeenCalledWith({
      hotspot,
      industry: '酒店民宿',
      idea,
      videoStyle: '纪录片风格',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
