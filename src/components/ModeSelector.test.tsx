// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModeSelector } from './ModeSelector'

afterEach(cleanup)

describe('ModeSelector', () => {
  it('exposes selected tab state and supports arrow navigation', () => {
    const onSelect = vi.fn()
    render(<ModeSelector mode="focus" status="idle" onSelect={onSelect} />)

    const focus = screen.getByRole('tab', { name: '专注' })
    expect(focus.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(focus, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('shortBreak')
  })

  it('keeps mode switching disabled while the timer runs', () => {
    const onSelect = vi.fn()
    render(<ModeSelector mode="focus" status="running" onSelect={onSelect} />)

    const focus = screen.getByRole('tab', { name: '专注' })
    fireEvent.keyDown(focus, { key: 'ArrowRight' })
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: '短休息' }).hasAttribute('disabled')).toBe(true)
  })
})
