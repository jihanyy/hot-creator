import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WorkflowSteps from '../components/WorkflowSteps'

const steps = [
  { id: 'field', label: '选择关注领域' },
  { id: 'hotspot', label: '热点筛选' },
  { id: 'ideas', label: '创意建议' },
]

describe('WorkflowSteps', () => {
  it('按完成、当前和未完成状态展示只读步骤进度', () => {
    render(
      <WorkflowSteps
        steps={steps}
        activeStepId="hotspot"
        completedStepIds={['field']}
      />,
    )

    const workflow = screen.getByRole('navigation', { name: '创作步骤' })
    const items = within(workflow).getAllByRole('listitem')

    expect(items).toHaveLength(3)
    expect(items[0].classList.contains('is-completed')).toBe(true)
    expect(items[1].getAttribute('aria-current')).toBe('step')
    expect(items[2].classList.contains('is-active')).toBe(false)
    expect(within(workflow).queryAllByRole('button')).toHaveLength(0)
    expect(within(workflow).queryAllByRole('link')).toHaveLength(0)
  })
})
