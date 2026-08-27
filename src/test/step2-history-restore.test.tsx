import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HotspotList from '../components/HotspotList'
import { WorkflowProvider } from '../context/WorkflowContext'
import { useWorkflow } from '../context/workflow-context'
import HotCreator from '../pages/HotCreator'
import { saveCreationHistory } from '../services/creationHistory'
import type { HotspotPageSnapshot, Interest, WorkflowState } from '../types/workflow'
import { createCompleteWorkflowState } from './creation-history-fixture'

function WorkflowStateProbe() {
  const { state } = useWorkflow()
  return <output data-testid="step2-workflow-state">{JSON.stringify(state)}</output>
}

function createHotspotFetchMock(prefix: string) {
  const liveHotspots = Array.from({ length: 8 }, (_, index) => ({
    title: `${prefix}热点${index + 1}`,
    summary: `${prefix}领域的消费与经营趋势。`,
    platform: '微博',
    rank: index + 1,
    hotScore: 900_000 - index * 10_000,
  }))

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path === '/api/hotspots') {
      return new Response(JSON.stringify(liveHotspots), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (path === '/api/ai/hotspot-ranking') {
      const request = JSON.parse(String(init?.body)) as { hotspots: unknown[] }
      return new Response(JSON.stringify(request.hotspots.map((_, index) => ({
        index,
        relevance: 90,
        businessValue: 85,
        creativeValue: 88,
      }))), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (path === '/api/ai/hotspot-reasons') {
      const request = JSON.parse(String(init?.body)) as {
        hotspots: Array<{ index: number; title: string }>
      }
      return new Response(JSON.stringify(request.hotspots.map((hotspot) => ({
        index: hotspot.index,
        reason: `${hotspot.title}与当前领域相关。`,
      }))), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(null, { status: 404 })
  })
}

function returnFromPromptToHotspots() {
  for (const buttonName of [
    '返回分镜',
    '返回视频参数',
    '返回脚本',
    '返回创意建议',
    '返回热点列表',
  ]) {
    fireEvent.click(screen.getByRole('button', { name: buttonName }))
  }
}

describe('Step2 历史候选页恢复', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('新建创作进入 Step2 仍自动请求，成功后写入 WorkflowState', async () => {
    const fetchMock = createHotspotFetchMock('新建流程')
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
        <WorkflowStateProbe />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /酒店民宿/ }))
    fireEvent.click(screen.getByRole('button', { name: /开始筛选热点/ }))

    await waitFor(() => expect(screen.getByText('新建流程热点1')).toBeTruthy())
    const state = JSON.parse(
      screen.getByTestId('step2-workflow-state').textContent ?? '{}',
    ) as WorkflowState

    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/hotspots')).toBe(true)
    expect(state.hotspotPage).toMatchObject({
      interests: [{ id: '酒店民宿', name: '酒店民宿' }],
      hotspotBatchIndex: 0,
    })
    expect(state.hotspotPage?.hotspots).toHaveLength(7)
    expect(state.hotspotPage?.hotspots[0].recommendationReasons?.length).toBeGreaterThan(0)
  })

  it('历史恢复后返回 Step2 直接显示保存页，主动换一批才重新请求', async () => {
    const savedWorkflow = createCompleteWorkflowState('历史已选热点')
    saveCreationHistory('restored-page', savedWorkflow)
    const fetchMock = createHotspotFetchMock('换批后')
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '恢复历史记录：历史已选热点' }))
    returnFromPromptToHotspots()

    expect(screen.getAllByText('历史已选热点').length).toBeGreaterThan(0)
    expect(screen.getByText('民宿服务价值讨论')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /换一批/ }))

    await waitFor(() => expect(screen.getByText('换批后热点8')).toBeTruthy())
    expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/hotspots')).toBe(true)
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-ranking'),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === '/api/ai/hotspot-reasons'),
    ).toBe(true)
  })

  it.each([
    {
      name: 'interests 不匹配',
      interests: [{ id: 'food', name: '餐饮' }],
      batchIndex: 0,
    },
    {
      name: 'hotspotBatchIndex 不匹配',
      interests: [{ id: 'hotel', name: '酒店民宿' }],
      batchIndex: 1,
    },
  ])('已保存页的 $name 时不会错误复用', async ({ interests, batchIndex }) => {
    const savedPage = createCompleteWorkflowState().hotspotPage as HotspotPageSnapshot
    const fetchMock = createHotspotFetchMock(`不匹配${batchIndex}${interests[0].id}`)
    vi.stubGlobal('fetch', fetchMock)

    render(
      <HotspotList
        interests={interests as Interest[]}
        batchIndex={batchIndex}
        initialHotspotPage={savedPage}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/hotspots')).toBe(true)
    })
  })

  it('旧历史没有 hotspotPage 时回退到自动筛选', async () => {
    const legacyWorkflow = createCompleteWorkflowState('旧历史热点')
    delete legacyWorkflow.hotspotPage
    saveCreationHistory('legacy-history', legacyWorkflow)
    const fetchMock = createHotspotFetchMock('旧历史回退')
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '恢复历史记录：旧历史热点' }))
    returnFromPromptToHotspots()

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/hotspots')).toBe(true)
    })
  })
})
