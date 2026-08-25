import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HotCreator from '../pages/HotCreator'
import { WorkflowProvider } from '../context/WorkflowContext'

function createFiveRankedHotspots(suffix: string) {
  return Array.from({ length: 5 }, (_, index) => ({
    title: `餐饮推荐热点${suffix}-${index + 1}`,
    summary: '餐饮消费趋势和门店经营变化。',
    platform: '微博' as const,
    rank: index + 1,
    hotScore: 100_000 - index * 1_000,
  }))
}

function rankingResponse(init?: RequestInit) {
  const request = JSON.parse(String(init?.body)) as {
    hotspots: Array<{ title: string }>
  }
  return new Response(
    JSON.stringify(request.hotspots.map((_, index) => ({
      index,
      relevance: 90,
      businessValue: 80,
      creativeValue: 85,
    }))),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function renderStep2WithFetch(fetchMock: unknown) {
  vi.stubGlobal('fetch', fetchMock)
  render(
    <WorkflowProvider>
      <HotCreator />
    </WorkflowProvider>,
  )

  fireEvent.click(screen.getByRole('button', { name: /餐饮/ }))
  fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))
}

describe('Step2 推荐原因降级', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ranking 成功但 reasons 返回空数组时仍显示全部已筛选热点', async () => {
    const liveHotspots = createFiveRankedHotspots('empty')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/hotspots') {
        return new Response(JSON.stringify(liveHotspots), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (String(input) === '/api/ai/hotspot-ranking') return rankingResponse(init)
      if (String(input) === '/api/ai/hotspot-reasons') {
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    })

    renderStep2WithFetch(fetchMock)

    await waitFor(() => expect(screen.getByText(/共 5 个推荐热点/)).toBeTruthy())
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(5)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ranking 成功但 reasons 请求失败时仍显示全部已筛选热点', async () => {
    const liveHotspots = createFiveRankedHotspots('failed')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/hotspots') {
        return new Response(JSON.stringify(liveHotspots), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (String(input) === '/api/ai/hotspot-ranking') return rankingResponse(init)
      if (String(input) === '/api/ai/hotspot-reasons') {
        return new Response('upstream failed', { status: 502 })
      }
      return new Response(null, { status: 404 })
    })

    renderStep2WithFetch(fetchMock)

    await waitFor(() => expect(screen.getByText(/共 5 个推荐热点/)).toBeTruthy())
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(5)
    expect(screen.queryByText('AI筛选暂时失败，请稍后重试。')).toBeNull()
  })

  it('reasons 只返回部分有效结果时仍显示全部热点并保留有效原因', async () => {
    const liveHotspots = createFiveRankedHotspots('partial')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/hotspots') {
        return new Response(JSON.stringify(liveHotspots), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (String(input) === '/api/ai/hotspot-ranking') return rankingResponse(init)
      if (String(input) === '/api/ai/hotspot-reasons') {
        return new Response(JSON.stringify([
          { index: 0, reason: '有效推荐原因一' },
          { index: 2, reason: '有效推荐原因二' },
          { index: 4, reason: '' },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    })

    renderStep2WithFetch(fetchMock)

    await waitFor(() => expect(screen.getByText(/共 5 个推荐热点/)).toBeTruthy())
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(5)
    expect(screen.getByText(/有效推荐原因一/)).toBeTruthy()
    expect(screen.getByText(/有效推荐原因二/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('只有 ranking 本身失败时才显示 AI 筛选失败', async () => {
    const liveHotspots = createFiveRankedHotspots('ranking-failed')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/hotspots') {
        return new Response(JSON.stringify(liveHotspots), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (String(input) === '/api/ai/hotspot-ranking') {
        return new Response('ranking failed', { status: 502 })
      }
      return new Response(null, { status: 404 })
    })

    renderStep2WithFetch(fetchMock)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('AI筛选暂时失败，请稍后重试。'),
    )
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-reasons')).toBe(false)
  })
})
