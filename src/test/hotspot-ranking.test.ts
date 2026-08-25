import { describe, expect, it } from 'vitest'
import { rankHotspots, selectHotspotCandidates } from '../services/hotspot-ranking'
import type { Hotspot, Interest } from '../types/workflow'

describe('热点推荐指数', () => {
  it('按热度 × 领域相关度 × 商业与创作价值排序，而不是只按热度', () => {
    const interests: Interest[] = [
      { id: 'ecommerce', name: '电商零售' },
    ]
    const hotspots: Hotspot[] = [
      {
        title: '高热度社会新闻',
        summary: '与用户关注领域无关的突发事件。',
        platform: '微博',
        rank: 1,
        hotScore: 20_000_000,
      },
      {
        title: '电商平台商品价格调整',
        summary: '消费趋势变化带来新的品牌营销和购物行为选题。',
        platform: '抖音',
        rank: 8,
        hotScore: 500_000,
      },
    ]

    const ranked = rankHotspots(hotspots, interests, [
      {
        index: 0,
        relevance: 5,
        businessValue: 10,
        creativeValue: 15,
      },
      {
        index: 1,
        relevance: 95,
        businessValue: 90,
        creativeValue: 92,
      },
    ])

    const expectedRelevantIndex = Math.round(
      100 *
        (Math.log1p(500_000) / Math.log1p(20_000_000)) *
        0.95 *
        (0.9 * 0.3 + 0.92 * 0.7),
    )

    expect(ranked[0].title).toBe('电商平台商品价格调整')
    expect(ranked[0].recommendationIndex).toBe(expectedRelevantIndex)
    expect(ranked[1].recommendationIndex).toBe(
      Math.round(100 * 1 * 0.05 * (0.1 * 0.3 + 0.15 * 0.7)),
    )
    expect(ranked[0].recommendationReasons?.[0]).toContain(
      '适合“电商零售”创作',
    )
  })

  it('只使用 AI 返回的热点评分，缺失 index 不回退到本地评分', () => {
    const interests: Interest[] = [{ id: 'ecommerce', name: '电商零售' }]
    const hotspots: Hotspot[] = [
      {
        title: '未返回评分的热点',
        summary: '电商消费趋势。',
        platform: '微博',
        rank: 1,
        hotScore: 500_000,
      },
      {
        title: 'AI 返回评分的热点',
        summary: '电商消费趋势。',
        platform: '抖音',
        rank: 2,
        hotScore: 400_000,
      },
    ]

    const ranked = rankHotspots(hotspots, interests, [
      { index: 1, relevance: 80, businessValue: 85, creativeValue: 90 },
    ])

    expect(ranked).toHaveLength(1)
    expect(ranked[0].title).toBe('AI 返回评分的热点')
  })

  it('AI 返回空评分时不生成本地补评分结果', () => {
    const ranked = rankHotspots(
      [
        {
          title: '候选热点',
          summary: '电商消费趋势。',
          platform: '微博',
          rank: 1,
          hotScore: 500_000,
        },
      ],
      [{ id: 'ecommerce', name: '电商零售' }],
      [],
    )

    expect(ranked).toEqual([])
  })

  it('进入 AI ranking 前按规范化标题去重并优先保留有效热度版本', () => {
    const interests: Interest[] = [{ id: 'ecommerce', name: '电商零售' }]
    const candidates = selectHotspotCandidates([
      {
        title: '“东北雨姐”拟售电商孵化基地',
        summary: '',
        platform: '腾讯',
        rank: 8,
        hotScore: 0,
      },
      {
        title: ' ＂东北雨姐＂拟售电商孵化基地！ ',
        summary: '该基地拟用于电商团队孵化与直播经营。',
        platform: '头条',
        rank: 12,
        hotScore: 620_000,
      },
    ], interests, 21)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      platform: '头条',
      hotScore: 620_000,
    })
  })

  it('缺失热度不把综合推荐指数乘成零，但明确的真实零热度仍按零计算', () => {
    const interests: Interest[] = [{ id: 'ecommerce', name: '电商零售' }]
    const ranked = rankHotspots([
      {
        title: '缺失热度的高价值热点',
        summary: '电商消费与品牌经营趋势。',
        platform: '腾讯',
        rank: 1,
        hotScore: 0,
      },
      {
        title: '明确零热度的高价值热点',
        summary: '电商消费与品牌经营趋势。',
        platform: '微博',
        rank: 2,
        hotScore: 0,
      },
    ], interests, [
      { index: 0, relevance: 80, businessValue: 90, creativeValue: 80 },
      { index: 1, relevance: 80, businessValue: 90, creativeValue: 80 },
    ])

    expect(
      ranked.find((hotspot) => hotspot.title === '缺失热度的高价值热点')?.recommendationIndex,
    ).toBe(Math.round(100 * 0.8 * (0.9 * 0.3 + 0.8 * 0.7)))
    expect(
      ranked.find((hotspot) => hotspot.title === '明确零热度的高价值热点')?.recommendationIndex,
    ).toBe(0)
  })
})
