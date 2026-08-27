import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CREATION_HISTORY_STORAGE_KEY,
  MAX_CREATION_HISTORY,
  createHistorySessionId,
  deleteCreationHistory,
  getCreationHistory,
  listCreationHistory,
  saveCreationHistory,
} from '../services/creationHistory'
import { createCompleteWorkflowState } from './creation-history-fixture'

describe('creationHistory store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('序列化并读取完整 WorkflowState', () => {
    const workflow = createCompleteWorkflowState()
    saveCreationHistory('session-1', workflow)

    const history = getCreationHistory('session-1')
    expect(history?.title).toBe(workflow.hotspot?.title)
    expect(history?.workflow).toEqual(workflow)
    expect(listCreationHistory()).toHaveLength(1)
  })

  it('同一 session 更新时不重复新增', () => {
    const initial = createCompleteWorkflowState()
    saveCreationHistory('session-1', initial)

    const updated = createCompleteWorkflowState()
    updated.prompts[0].imagePrompt = '更新后的图片提示词。'
    saveCreationHistory('session-1', updated)

    const histories = listCreationHistory()
    expect(histories).toHaveLength(1)
    expect(histories[0].workflow.prompts[0].imagePrompt).toBe('更新后的图片提示词。')
  })

  it('可以删除单条历史且不影响其他记录', () => {
    saveCreationHistory('session-1', createCompleteWorkflowState('记录一'))
    saveCreationHistory('session-2', createCompleteWorkflowState('记录二'))

    deleteCreationHistory('session-1')

    expect(getCreationHistory('session-1')).toBeNull()
    expect(getCreationHistory('session-2')?.title).toBe('记录二')
  })

  it('超过上限时清理最旧记录', () => {
    vi.useFakeTimers()
    const start = new Date('2026-01-01T00:00:00.000Z')

    for (let index = 0; index < MAX_CREATION_HISTORY + 5; index += 1) {
      vi.setSystemTime(new Date(start.getTime() + index * 1_000))
      saveCreationHistory(`session-${index}`, createCompleteWorkflowState(`记录 ${index}`))
    }

    const histories = listCreationHistory()
    expect(histories).toHaveLength(MAX_CREATION_HISTORY)
    expect(histories[0].id).toBe(`session-${MAX_CREATION_HISTORY + 4}`)
    expect(histories.at(-1)?.id).toBe('session-5')
  })

  it('localStorage 中存在损坏 JSON 时返回空列表且不会崩溃', () => {
    localStorage.setItem(CREATION_HISTORY_STORAGE_KEY, '{broken json')

    expect(listCreationHistory()).toEqual([])
    expect(() => saveCreationHistory('session-1', createCompleteWorkflowState())).not.toThrow()
    expect(listCreationHistory()).toHaveLength(1)
  })

  it('为新创作生成不同的 session id', () => {
    expect(createHistorySessionId()).not.toBe(createHistorySessionId())
  })
})
