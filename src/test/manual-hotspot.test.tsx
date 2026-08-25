import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HotCreator from '../pages/HotCreator'
import { WorkflowProvider } from '../context/WorkflowContext'

function startStep2() {
  fireEvent.click(screen.getByRole('button', { name: /餐饮/ }))
  fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))
}

describe('Step2 人工指定热点', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('提交人工热点后直接进入 Step3，使用标准 Hotspot 且不调用 ranking', async () => {
    let resolveHotspots: ((response: Response) => void) | undefined
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) => {
      if (String(input) === '/api/hotspots') {
        return new Promise<Response>((resolve) => {
          resolveHotspots = resolve
        })
      }
      if (String(input) === '/api/ai/creative') {
        return Promise.resolve(new Response(JSON.stringify([
          { id: 'creative-1', title: '创意方案', description: '创意说明' },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      }
      if (String(input) === '/api/ai/hotspot-ranking') {
        return Promise.reject(new Error('manual hotspot must not call ranking'))
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )
    startStep2()

    fireEvent.change(screen.getByPlaceholderText('输入你想创作的热点'), {
      target: { value: '某品牌发布新品' },
    })
    fireEvent.change(screen.getByPlaceholderText('输入你希望创作的内容'), {
      target: { value: '做一个新品营销分析' },
    })
    fireEvent.click(screen.getByRole('button', { name: '使用这个热点' }))

    await waitFor(() => expect(screen.getByText('某品牌发布新品')).toBeTruthy())
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/creative')).toBe(true),
    )

    const creativeCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === '/api/ai/creative',
    )
    const requestBody = JSON.parse(String(creativeCall?.[1]?.body)) as {
      hotspot: {
        title: string
        summary: string
        platform: string
        rank: number
        hotScore: number
      }
    }
    expect(requestBody.hotspot).toEqual({
      title: '某品牌发布新品',
      summary: '做一个新品营销分析',
      platform: '用户输入',
      rank: 1,
      hotScore: 0,
    })
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-ranking')).toBe(false)

    resolveHotspots?.(new Response(JSON.stringify([{
      title: '未使用的系统热点',
      summary: '系统摘要',
      platform: '微博',
      rank: 1,
      hotScore: 100,
    }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('未使用人工入口时原热点推荐流程仍调用 ranking 并展示结果', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/hotspots') {
        return new Response(JSON.stringify([{
          title: '系统推荐热点',
          summary: '餐饮消费趋势',
          platform: '微博',
          rank: 1,
          hotScore: 100,
        }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (String(input) === '/api/ai/hotspot-ranking') {
        const request = JSON.parse(String(init?.body)) as { hotspots: unknown[] }
        return new Response(JSON.stringify(request.hotspots.map((_, index) => ({
          index,
          relevance: 90,
          businessValue: 80,
          creativeValue: 85,
        }))), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (String(input) === '/api/ai/hotspot-reasons') {
        return new Response('[]', {
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
    startStep2()

    await waitFor(() => expect(screen.getByText('系统推荐热点')).toBeTruthy())
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-ranking')).toBe(true)
  })
  it('enables manual hotspot action with title only and passes an empty summary', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/hotspots') {
        return new Promise<Response>(() => {})
      }
      if (String(input) === '/api/ai/creative') {
        return new Response(JSON.stringify([
          { id: 'creative-1', title: '创意方案', description: '创意说明' },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (String(input) === '/api/ai/hotspot-ranking') {
        throw new Error('manual hotspot must not call ranking')
      }
      void init
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )
    startStep2()

    const form = document.querySelector('.manual-hotspot-form') as HTMLFormElement
    const titleInput = form.querySelector('.manual-hotspot-title-field input') as HTMLInputElement
    const button = form.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)

    fireEvent.change(titleInput, { target: { value: '某个热点' } })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/creative')).toBe(true),
    )
    const creativeCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === '/api/ai/creative',
    )
    const requestBody = JSON.parse(String(creativeCall?.[1]?.body)) as {
      hotspot: {
        title: string
        summary: string
        platform: string
        rank: number
        hotScore: number
      }
    }
    expect(requestBody.hotspot).toEqual({
      title: '某个热点',
      summary: '',
      platform: '用户输入',
      rank: 1,
      hotScore: 0,
    })
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-ranking')).toBe(false)
  })
})
