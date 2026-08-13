// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Clock } from '../domain/timer'
import { createLocalDateBoundaryWatcher } from './localDate'

class FakeClock implements Clock {
  timestamp: number

  constructor(timestamp: number) {
    this.timestamp = timestamp
  }
  now = () => this.timestamp
}

afterEach(() => vi.restoreAllMocks())

describe('local date visibility reconciliation', () => {
  it('refreshes the current date when the WebView becomes visible', () => {
    const clock = new FakeClock(new Date(2026, 7, 10, 23, 59, 0).getTime())
    const onDateChange = vi.fn()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const watcher = createLocalDateBoundaryWatcher({ clock, onDateChange })

    clock.timestamp = new Date(2026, 7, 11, 8, 0, 0).getTime()
    document.dispatchEvent(new Event('visibilitychange'))

    expect(onDateChange).toHaveBeenCalledWith('2026-08-11')
    watcher.dispose()
  })

  it('refreshes the current date when the window regains focus', () => {
    const clock = new FakeClock(new Date(2026, 7, 10, 23, 59, 0).getTime())
    const onDateChange = vi.fn()
    const watcher = createLocalDateBoundaryWatcher({ clock, onDateChange })

    clock.timestamp = new Date(2026, 7, 11, 8, 0, 0).getTime()
    window.dispatchEvent(new Event('focus'))

    expect(onDateChange).toHaveBeenCalledWith('2026-08-11')
    watcher.dispose()
  })
})
