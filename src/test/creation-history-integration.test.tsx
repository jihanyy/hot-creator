import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HotCreator from '../pages/HotCreator'
import { WorkflowProvider } from '../context/WorkflowContext'
import { useWorkflow } from '../context/workflow-context'
import {
  listCreationHistory,
  saveCreationHistory,
} from '../services/creationHistory'
import type { WorkflowState } from '../types/workflow'
import { createCompleteWorkflowState } from './creation-history-fixture'

interface WorkflowProbeProps {
  first: WorkflowState
  second?: WorkflowState
}

function WorkflowProbe({ first, second }: WorkflowProbeProps) {
  const { state, restoreWorkflow } = useWorkflow()

  return (
    <>
      <button type="button" onClick={() => restoreWorkflow(first)}>
        完成流程 A
      </button>
      {second ? (
        <button type="button" onClick={() => restoreWorkflow(second)}>
          完成流程 B
        </button>
      ) : null}
      <output data-testid="workflow-history-state">{JSON.stringify(state)}</output>
    </>
  )
}

describe('HotCreator creation history integration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('点击历史记录完整恢复 WorkflowContext，且不调用 AI API', async () => {
    const savedWorkflow = createCompleteWorkflowState('可恢复的热点标题')
    saveCreationHistory('saved-session', savedWorkflow)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <HotCreator />
        <WorkflowProbe first={createCompleteWorkflowState('其他流程')} />
      </WorkflowProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: '恢复历史记录：可恢复的热点标题' }),
    )

    await waitFor(() => {
      const restoredState = JSON.parse(
        screen.getByTestId('workflow-history-state').textContent ?? '{}',
      ) as WorkflowState
      expect(restoredState).toEqual(savedWorkflow)
    })

    const currentStep = screen
      .getByRole('navigation', { name: '创作步骤' })
      .querySelector('[aria-current="step"]')
    expect(currentStep?.textContent).toContain('提示词')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('新建创作后使用新的 session，下一次完成不会覆盖旧历史', async () => {
    const first = createCompleteWorkflowState('第一条创作')
    const second = createCompleteWorkflowState('第二条创作')

    render(
      <WorkflowProvider>
        <HotCreator />
        <WorkflowProbe first={first} second={second} />
      </WorkflowProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '完成流程 A' }))
    await waitFor(() => expect(listCreationHistory()).toHaveLength(1))
    expect(listCreationHistory()[0].workflow.hotspotPage).toEqual(first.hotspotPage)
    const firstSessionId = listCreationHistory()[0].id

    fireEvent.click(screen.getByRole('button', { name: /新建创作/ }))
    await waitFor(() => {
      const resetState = JSON.parse(
        screen.getByTestId('workflow-history-state').textContent ?? '{}',
      ) as WorkflowState
      expect(resetState.activeStep).toBe('field')
    })

    fireEvent.click(screen.getByRole('button', { name: '完成流程 B' }))
    await waitFor(() => expect(listCreationHistory()).toHaveLength(2))

    const histories = listCreationHistory()
    expect(histories.map((history) => history.title)).toEqual([
      '第二条创作',
      '第一条创作',
    ])
    expect(histories[0].id).not.toBe(firstSessionId)
  })

  it('确认后只删除所选历史记录', async () => {
    saveCreationHistory('saved-1', createCompleteWorkflowState('保留记录'))
    saveCreationHistory('saved-2', createCompleteWorkflowState('待删除记录'))
    vi.stubGlobal('confirm', vi.fn(() => true))

    render(
      <WorkflowProvider>
        <HotCreator />
      </WorkflowProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: '删除历史记录：待删除记录' }),
    )

    await waitFor(() => {
      expect(listCreationHistory().map((history) => history.title)).toEqual(['保留记录'])
    })
    expect(screen.queryByText('待删除记录')).toBeNull()
    expect(screen.getByText('保留记录')).toBeTruthy()
  })
})
