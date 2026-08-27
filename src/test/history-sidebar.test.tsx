import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HistorySidebar from '../components/HistorySidebar'

describe('HistorySidebar', () => {
  it('在本地切换展开和收起状态，不重复提供新建入口', () => {
    render(
      <HistorySidebar
        histories={[]}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '历史记录' })).toBeTruthy()
    expect(screen.getByText('暂无历史记录')).toBeTruthy()
    expect(screen.getByText('完成一次创作后会显示在这里')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '收起历史记录' }))

    expect(screen.queryByRole('heading', { name: '历史记录' })).toBeNull()
    expect(screen.queryByText('暂无历史记录')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '展开历史记录' }))

    expect(screen.getByRole('heading', { name: '历史记录' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /新建创作/ })).toBeNull()
  })
})
