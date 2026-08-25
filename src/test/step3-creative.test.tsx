import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreativeSuggestions from '../components/CreativeSuggestions'
import { createFallbackCreatives } from '../mock/creative'
import { createPublishTimeRecommendation } from '../services/publish-time'
import type { Hotspot } from '../types/workflow'

const baseHotspot: Hotspot = {
  title: '普通热点',
  summary: '热点摘要',
  platform: '全网',
  rank: 8,
  hotScore: 500_000,
}

describe('Step3 动态发布时间推荐', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('根据时效、领域和平台返回不同的发布时间及原因', () => {
    const urgent = createPublishTimeRecommendation({
      ...baseHotspot,
      title: '平台官宣商品价格调整',
      platform: '微博',
      rank: 1,
      matchedInterest: '电商零售',
    })
    const travel = createPublishTimeRecommendation({
      ...baseHotspot,
      title: '周末民宿预订攻略',
      summary: '住宿与出行消费趋势分析。',
      platform: '小红书',
      matchedInterest: '酒店民宿',
    })
    const education = createPublishTimeRecommendation({
      ...baseHotspot,
      title: '学生学习方法讨论',
      summary: '家长与学生关注课程和学习效率。',
      platform: '百度',
      matchedInterest: '教育',
    })

    expect(urgent.time).toContain('趁热点窗口')
    expect(urgent.reason).toContain('时效衰减快')
    expect(urgent.reason).toContain('微博')
    expect(travel.time).toContain('本周')
    expect(travel.reason).toContain('周末前集中规划')
    expect(travel.reason).toContain('小红书')
    expect(education.time).toContain('明天')
    expect(education.reason).toContain('家长、学生和教育从业者')
    expect(new Set([urgent.time, travel.time, education.time]).size).toBe(3)
  })

  it('AI fallback 也将热点关注点转译成用户自己的行业内容', () => {
    const ideas = createFallbackCreatives(
      {
        ...baseHotspot,
        title: '某零食品牌称重争议',
        summary: '消费者质疑重复称重和交易透明度。',
        matchedInterest: '餐饮',
      },
      [{ id: 'restaurant', name: '餐饮' }],
    )
    const content = ideas.map((idea) => `${idea.title} ${idea.description}`).join(' ')

    expect(ideas).toHaveLength(3)
    expect(content).toContain('餐饮')
    expect(content).toContain('计量、价格与交易透明度')
    expect(content).not.toContain('某零食品牌')
    expect(content).not.toContain('反常识开场')
    expect(content).not.toMatch(/热点|事件|涉事|争议/)
    expect(ideas.map((idea) => idea.title).join(' ')).toMatch(/我们店|老板|顾客/)
    expect(ideas.every((idea) => /拍摄|现场|镜头/.test(idea.description))).toBe(true)
    expect(ideas.every((idea) => /展示|公开|看见/.test(idea.description))).toBe(true)
    expect(ideas.every((idea) => /信任|转化|到店|咨询|下单|选择/.test(idea.description))).toBe(true)
    expect(content).not.toMatch(/消费者应该如何|行业如何|从业者如何/)

    const selfMediaContent = createFallbackCreatives(
      {
        ...baseHotspot,
        title: '某零食品牌称重争议',
        summary: '消费者质疑重复称重和交易透明度。',
        matchedInterest: '自媒体',
      },
      [{ id: 'media', name: '自媒体' }],
    ).map((idea) => `${idea.title} ${idea.description}`).join(' ')
    expect(selfMediaContent).not.toMatch(/热点|事件|涉事|争议|某零食品牌/)
  })

  it('酒店收入类热点保留价格、成本与服务价值的核心矛盾', () => {
    const ideas = createFallbackCreatives(
      {
        ...baseHotspot,
        title: '酒店订单收入引发讨论',
        summary: '消费者支付金额、平台结算和商家实际到手收入存在明显差异。',
        matchedInterest: '酒店民宿',
      },
      [{ id: 'hotel', name: '酒店民宿' }],
    )
    const content = ideas.map((idea) => `${idea.title} ${idea.description}`).join(' ')

    expect(content).toContain('民宿经营成本')
    expect(content).toContain('订单价格构成')
    expect(content).toContain('服务价值与真实经营情况')
    expect(content).toContain('消费者支付价格、平台费用与商家实际收入之间的信息差')
    expect(content).not.toContain('卫生检查')
    expect(content).not.toMatch(/热点复盘|事件点评|涉事品牌/)
    expect(ideas.every((idea) => /拍摄|现场|记录/.test(idea.description))).toBe(true)
    expect(ideas.every((idea) => /展示|公开|看见/.test(idea.description))).toBe(true)
    expect(ideas.every((idea) => /信任|转化|到店|咨询|下单|选择/.test(idea.description))).toBe(true)
  })

  it('Step3 页面显示动态时间并将模块编号映射为 03', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 'idea-1', title: '消费者选择', description: '消费者视角方案' },
          { id: 'idea-2', title: '商家应对', description: '商家视角方案' },
          { id: 'idea-3', title: '行业变化', description: '行业分析方案' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <CreativeSuggestions
        hotspot={{
          ...baseHotspot,
          title: '平台官宣商品价格调整',
          platform: '微博',
          rank: 1,
          matchedInterest: '电商零售',
        }}
        interests={[{ id: 'ecommerce', name: '电商零售' }]}
        onBack={vi.fn()}
        onIdeasChange={vi.fn()}
        onSelectCreative={vi.fn()}
      />,
    )

    expect(container.querySelector('.publish-time-icon')).toBeNull()
    const publishTimeNumbers = container.querySelectorAll('.publish-time-panel .section-number')
    expect(publishTimeNumbers).toHaveLength(1)
    expect(publishTimeNumbers[0]?.textContent?.trim()).toBe('03')
    expect(screen.getByText('趁热点窗口：今天 2 小时内')).toBeTruthy()
    expect(screen.getByText(/时效衰减快/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('消费者选择')).toBeTruthy())
  })
})
