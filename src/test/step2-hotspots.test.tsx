import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HotCreator from '../pages/HotCreator'
import { WorkflowProvider } from '../context/WorkflowContext'


describe('Step2 热点筛选流程', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('优先展示与所选领域相关且具备创作价值的 AI 筛选结果', async () => {
    let resolveHotData: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/hotspots') {
        return new Promise<Response>((resolve) => {
          resolveHotData = resolve
        })
      }

      if (String(input) === '/api/ai/hotspot-ranking') {
        const request = JSON.parse(String(init?.body)) as {
          hotspots: Array<{ title: string }>
        }
        const assessments = request.hotspots.map((hotspot, index) =>
          hotspot.title.includes('品牌电商平台')
            ? {
                index,
                relevance_score: '95%',
                businessValue: '90',
                creativeValue: '92',
              }
            : {
                index,
                relevance: '5%',
                businessValue: '10',
                creativeValue: '15',
              },
        )
        return new Response(JSON.stringify(assessments), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (String(input) === '/api/ai/hotspot-reasons') {
        const request = JSON.parse(String(init?.body)) as {
          hotspots: Array<{ index: number; title: string }>
        }
        return new Response(
          JSON.stringify(
            request.hotspots.map((hotspot) => ({
              index: hotspot.index,
              reason: hotspot.title.includes('品牌电商平台')
                ? '商品消费与品牌营销变化可直接转化为电商选题。'
                : '与电商零售用户的经营和消费主题缺乏直接联系。',
            })),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /电商零售/ }))
    fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))

    expect(screen.getByRole('heading', { name: '为你推荐的热点' })).toBeTruthy()
    expect(screen.getByText(/AI 正在筛选热点/)).toBeTruthy()
    expect(screen.queryByText(/共 0 个推荐热点/)).toBeNull()
    resolveHotData?.(
      new Response(
        JSON.stringify([
          {
            title: '全网热议社会事件',
            summary: '与零售消费无关的突发社会新闻。',
            platform: '微博',
            rank: 1,
            hotScore: 20_000_000,
          },
          {
            title: '品牌电商平台调整商品价格',
            summary: '消费趋势和购物行为变化，为品牌营销与新消费内容提供切入点。',
            platform: '抖音',
            rank: 8,
            hotScore: 500_000,
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 3 })[0].textContent).toContain(
        '品牌电商平台调整商品价格',
      ),
    )
    expect(screen.getByText('第 1 批 · 共 1 个推荐热点')).toBeTruthy()
    expect(screen.queryByText('全网热议社会事件')).toBeNull()
    expect(
      screen.getByText(/适合“电商零售”创作：商品消费与品牌营销变化/),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/hotspots',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/hotspot-ranking',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/hotspot-reasons',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('AI 成功但没有达到 20 分的热点时显示正常空状态', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/hotspots') {
        return new Response(
          JSON.stringify([
            {
              title: '真实但低相关热点',
              summary: '该事件与当前领域没有足够联系。',
              platform: '微博',
              rank: 1,
              hotScore: 800_000,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (String(input) === '/api/ai/hotspot-ranking') {
        return new Response(
          JSON.stringify([
            {
              index: 0,
              relevance_score: '19%',
              businessValue: '40',
              creativeValue: '50',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /餐饮/ }))
    fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        '暂时没有找到与当前领域足够相关的热点，可以换一批或调整关注领域。',
      ),
    )
    expect(screen.queryByText('真实但低相关热点')).toBeNull()
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-reasons'),
    ).toBe(false)
  })

  it('真实热点数据获取失败时显示指定错误，且不调用 AI 或展示热点', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /餐饮/ }))
    fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))

    expect(screen.getByRole('heading', { name: '为你推荐的热点' })).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        '热点数据获取失败，请前往热点信息页面查看热点后重试。',
      ),
    )
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).startsWith('/api/ai/')),
    ).toBe(false)
  })

  it('AI 筛选失败时显示错误且不展示本地伪成功结果', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/hotspots') {
        return new Response(
          JSON.stringify([
            {
              title: '真实餐饮消费趋势热点',
              summary: '餐厅门店经营与菜品消费变化正在受到关注。',
              platform: '微博',
              rank: 2,
              hotScore: 600_000,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (String(input) === '/api/ai/hotspot-ranking') {
        throw new Error('AI unavailable')
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /餐饮/ }))
    fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('AI筛选暂时失败，请稍后重试。'),
    )
    expect(screen.queryByText('真实餐饮消费趋势热点')).toBeNull()
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-reasons'),
    ).toBe(false)
  })

  it('跨平台同标题只展示一次，换批不重复且到末批后不循环', async () => {
    const liveHotspots = [
      {
        title: '“东北雨姐”拟售电商孵化基地',
        summary: '',
        platform: '腾讯',
        rank: 1,
        hotScore: 0,
      },
      {
        title: '＂东北雨姐＂拟售电商孵化基地！',
        summary: '电商团队孵化与直播经营受到关注。',
        platform: '头条',
        rank: 2,
        hotScore: 900_000,
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        title: `餐饮经营趋势热点${index + 1}`,
        summary: `餐厅门店经营和餐饮消费变化${index + 1}。`,
        platform: '微博',
        rank: index + 2,
        hotScore: 800_000 - index * 10_000,
      })),
    ]
    const rankingRequests: Array<{ hotspots: Array<{ title: string; hotScore: number }> }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/hotspots') {
        return new Response(JSON.stringify(liveHotspots), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (String(input) === '/api/ai/hotspot-ranking') {
        const request = JSON.parse(String(init?.body)) as {
          hotspots: Array<{ title: string; hotScore: number }>
        }
        rankingRequests.push(request)
        return new Response(JSON.stringify(request.hotspots.map((_, index) => ({
          index,
          relevance: 80,
          businessValue: 85,
          creativeValue: 90,
        }))), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (String(input) === '/api/ai/hotspot-reasons') {
        const request = JSON.parse(String(init?.body)) as {
          hotspots: Array<{ index: number; title: string }>
        }
        return new Response(JSON.stringify(request.hotspots.map((hotspot) => ({
          index: hotspot.index,
          reason: `${hotspot.title}与餐饮经营和消费趋势相关。`,
        }))), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /餐饮/ }))
    fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))

    await waitFor(() => expect(screen.getByText('第 1 批 · 共 7 个推荐热点')).toBeTruthy())
    const firstBatchTitles = screen.getAllByRole('heading', { level: 3 }).map(
      (heading) => heading.textContent ?? '',
    )

    fireEvent.click(screen.getByRole('button', { name: /换一批/ }))
    await waitFor(() => expect(screen.getByText('第 2 批 · 共 1 个推荐热点')).toBeTruthy())
    const secondBatchTitles = screen.getAllByRole('heading', { level: 3 }).map(
      (heading) => heading.textContent ?? '',
    )

    expect(secondBatchTitles).toHaveLength(1)
    expect(secondBatchTitles.some((title) => firstBatchTitles.includes(title))).toBe(false)
    expect(
      [...firstBatchTitles, ...secondBatchTitles].filter((title) => title.includes('东北雨姐')),
    ).toHaveLength(1)
    expect(rankingRequests).toHaveLength(1)
    expect(rankingRequests[0].hotspots).toHaveLength(8)
    expect(rankingRequests[0].hotspots.find((hotspot) => hotspot.title.includes('东北雨姐'))).toMatchObject({
      hotScore: 900_000,
    })

    fireEvent.click(screen.getByRole('button', { name: /换一批/ }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('暂时没有更多符合条件的热点。'),
    )
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
})
