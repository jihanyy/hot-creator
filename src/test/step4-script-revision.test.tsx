import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScriptGenerator from '../components/ScriptGenerator'
import { WorkflowProvider } from '../context/WorkflowContext'
import { useWorkflow } from '../context/workflow-context'
import type { CreativeSelection, Hotspot, Script } from '../types/workflow'

const hotspot: Hotspot = {
  title: '酒店订单收入讨论',
  summary: '消费者关注价格、平台费用和服务价值。',
  platform: '微博',
  rank: 1,
  hotScore: 900_000,
  matchedInterest: '酒店民宿',
}

const creativeSelection: CreativeSelection = {
  hotspot,
  industry: '酒店民宿',
  idea: {
    id: 'creative-hotel-cost',
    title: '我们把民宿经营成本直接拍给顾客看',
    description: '把订单价格、成本和服务交付变成可拍内容。',
  },
  videoStyle: '抽象创意',
}

const initialScripts: Script[] = [
  {
    id: 'script-initial-1',
    title: '一笔民宿订单怎么拆',
    hook: '订单总价不等于商家收入。',
    body: '先说明顾客支付，再解释平台费用、经营成本和服务交付。',
    ending: '把账算清楚，价格才有依据。',
  },
  {
    id: 'script-initial-2',
    title: '顾客的钱去了哪里',
    hook: '先看一张订单的完整链路。',
    body: '从支付开始，对比清洁、布草、人力和入住服务。',
    ending: '完整交付决定最终价值。',
  },
  {
    id: 'script-initial-3',
    title: '入住前先核对三件事',
    hook: '判断价格前，先看服务包含项。',
    body: '核对费用说明、实际投入和最终客房状态。',
    ending: '看完具体结果再做选择。',
  },
]

const modifiedScript: Script = {
  id: 'script-modified',
  title: '把一笔订单拆成三个可见瞬间',
  hook: '只用三个画面，把民宿价格讲清楚。',
  body: '第一个画面呈现顾客支付，第二个画面呈现清洁与布草，第三个画面落在客房和入住服务结果。',
  ending: '三个画面，一条清楚的服务价值线。',
}

const changedAgainScript: Script = {
  id: 'script-changed-again',
  title: '让订单里的费用依次出场',
  hook: '一笔订单到账后，六项费用开始排队。',
  body: '房费站在中间，平台、清洁、布草、人力和服务依次出现，每一项都对应一个实际动作。',
  ending: '换个表达，仍然把价格和服务讲明白。',
}

function ScriptWorkflowHarness({ onConfirm }: { onConfirm: (script: Script) => void }) {
  const { state, updateScript } = useWorkflow()
  const rerenderedSelection: CreativeSelection = {
    hotspot: { ...creativeSelection.hotspot },
    industry: creativeSelection.industry,
    idea: { ...creativeSelection.idea },
    videoStyle: creativeSelection.videoStyle,
  }
  return (
    <>
      <ScriptGenerator
        creativeSelection={rerenderedSelection}
        currentScript={state.script}
        onBack={vi.fn()}
        onScriptChange={updateScript}
        onConfirm={onConfirm}
      />
      <output data-testid="workflow-script-state">
        {state.script ? JSON.stringify(state.script) : ''}
      </output>
    </>
  )
}

describe('Step4 聊天修改脚本', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('修改成功后同步更新聊天、脚本卡片和 WorkflowContext 四个字段', async () => {
    const confirmScript = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialScripts), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([modifiedScript]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([changedAgainScript]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <WorkflowProvider>
        <ScriptWorkflowHarness onConfirm={confirmScript} />
      </WorkflowProvider>,
    )

    await waitFor(() => expect(screen.getByText(initialScripts[0].title)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('输入调整要求'), {
      target: { value: '更幽默' },
    })
    fireEvent.click(screen.getByRole('button', { name: '发送创意要求' }))

    await waitFor(() => {
      expect(screen.getByText(/修改结果已同步到上方脚本卡片/)).toBeTruthy()
    })
    expect(screen.getByText(modifiedScript.title)).toBeTruthy()
    expect(screen.getByText(modifiedScript.hook)).toBeTruthy()
    expect(screen.getByText(modifiedScript.body)).toBeTruthy()
    expect(screen.getByText(modifiedScript.ending)).toBeTruthy()

    const workflowScript = JSON.parse(
      screen.getByTestId('workflow-script-state').textContent ?? '{}',
    )
    expect(workflowScript).toEqual(modifiedScript)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const revisionBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(revisionBody.instruction).toBe('更幽默')
    expect(revisionBody.currentScript).toEqual(initialScripts[0])

    vi.useFakeTimers()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    vi.useRealTimers()

    expect(screen.getByText(modifiedScript.title)).toBeTruthy()
    expect(screen.getByText(modifiedScript.hook)).toBeTruthy()
    expect(screen.getByText(modifiedScript.body)).toBeTruthy()
    expect(screen.getByText(modifiedScript.ending)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(screen.getByTestId('workflow-script-state').textContent ?? '{}'))
      .toEqual(modifiedScript)

    fireEvent.click(screen.getByRole('button', { name: '确定这个脚本' }))
    expect(confirmScript).toHaveBeenCalledWith(modifiedScript)

    fireEvent.click(screen.getByRole('button', { name: '换一个脚本' }))
    await waitFor(() => expect(screen.getByText(changedAgainScript.title)).toBeTruthy())
    const changeBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body))
    expect(changeBody.currentScript).toEqual(modifiedScript)
    expect(JSON.parse(screen.getByTestId('workflow-script-state').textContent ?? '{}'))
      .toEqual(changedAgainScript)
  })
})
