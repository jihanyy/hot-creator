import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ThemeToggle, { THEME_STORAGE_KEY } from '../components/ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY)
    delete document.documentElement.dataset.theme
  })

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY)
    delete document.documentElement.dataset.theme
  })

  it('首次访问默认使用浅色主题', async () => {
    render(<ThemeToggle />)

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: '切换到深色主题' })).toBeTruthy()
  })

  it('切换到深色主题后持久化，重新挂载仍保持', async () => {
    const firstRender = render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: '切换到深色主题' }))

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    firstRender.unmount()
    delete document.documentElement.dataset.theme

    render(<ThemeToggle />)

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(screen.getByRole('button', { name: '切换到浅色主题' })).toBeTruthy()
  })

  it('非法存储值不会启用深色主题', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'system')
    render(<ThemeToggle />)

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
