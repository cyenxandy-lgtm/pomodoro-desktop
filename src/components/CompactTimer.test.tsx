// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimerMode, TimerStatus } from '../types'
import { CompactTimer } from './CompactTimer'

afterEach(cleanup)

const renderCompact = (mode: TimerMode, status: TimerStatus) => {
  const handlers = {
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onReset: vi.fn(),
    onSkip: vi.fn(),
    onExpand: vi.fn(),
  }
  render(
    <CompactTimer
      mode={mode}
      status={status}
      remainingSeconds={125}
      {...handlers}
    />,
  )
  return handlers
}

describe('CompactTimer', () => {
  it.each([
    ['focus', '专注'],
    ['shortBreak', '短休息'],
    ['longBreak', '长休息'],
  ] as const)('shows %s mode without creating timer state', (mode, label) => {
    renderCompact(mode, 'idle')
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByRole('time').textContent).toBe('02:05')
  })

  it.each([
    ['idle', '开始', 'onStart'],
    ['running', '暂停', 'onPause'],
    ['paused', '继续', 'onResume'],
  ] as const)('delegates %s primary control to the existing timer callback', (status, label, key) => {
    const handlers = renderCompact('focus', status)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(handlers[key]).toHaveBeenCalledOnce()
  })

  it('expands without invoking any timer mutation', () => {
    const handlers = renderCompact('longBreak', 'paused')
    fireEvent.click(screen.getByRole('button', { name: '展开完整界面' }))
    expect(handlers.onExpand).toHaveBeenCalledOnce()
    expect(handlers.onStart).not.toHaveBeenCalled()
    expect(handlers.onPause).not.toHaveBeenCalled()
    expect(handlers.onResume).not.toHaveBeenCalled()
    expect(handlers.onReset).not.toHaveBeenCalled()
    expect(handlers.onSkip).not.toHaveBeenCalled()
  })
})
