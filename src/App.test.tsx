// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './utils/storage'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.dataset.theme = 'dark'
  document.documentElement.dataset.appearance = 'dark'
  document.documentElement.dataset.accent = 'rose'
})

describe('App compact mode', () => {
  it('announces state changes without making the countdown a live region', () => {
    render(<App />)
    const timer = screen.getByRole('time')
    expect(timer.closest('[aria-live]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '开始' }))
    expect(screen.getByRole('status').textContent).toContain('进行中')
  })

  it('switches normal and compact views without mutating the running timer snapshot', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '开始' }))
    const normalTime = screen.getByRole('time').getAttribute('datetime')

    fireEvent.click(screen.getByRole('button', { name: '进入紧凑模式' }))

    expect(screen.getByRole('main', { name: '紧凑计时器' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy()
    expect(screen.getByRole('time').getAttribute('datetime')).toBe(normalTime)

    fireEvent.click(screen.getByRole('button', { name: '展开完整界面' }))

    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy()
    expect(screen.getByRole('time').getAttribute('datetime')).toBe(normalTime)
  })

  it('persists appearance and keeps the theme across compact and statistics views', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    fireEvent.click(screen.getByRole('button', { name: '浅色' }))
    fireEvent.click(screen.getByRole('button', { name: /静蓝/ }))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.accent).toBe('blue')
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect(stored.appearance).toBe('light')
    expect(stored.accent).toBe('blue')

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    fireEvent.click(screen.getByRole('button', { name: '进入紧凑模式' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: '展开完整界面' }))
    fireEvent.click(screen.getByRole('button', { name: '统计' }))
    expect(screen.getByRole('region', { name: '番茄统计' })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
