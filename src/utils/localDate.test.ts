// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Clock } from '../domain/timer'
import {
  createLocalDateBoundaryWatcher,
  getLocalDateKey,
  millisecondsUntilNextLocalMidnight,
} from './localDate'

class FakeClock implements Clock {
  timestamp: number

  constructor(timestamp: number) {
    this.timestamp = timestamp
  }
  now = () => this.timestamp
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('local date boundary', () => {
  it('uses the local calendar date instead of an ISO UTC date', () => {
    const timestamp = new Date(2026, 7, 10, 23, 59, 58).getTime()
    expect(getLocalDateKey(timestamp)).toBe('2026-08-10')
  })

  it('calculates the next local midnight', () => {
    const timestamp = new Date(2026, 7, 10, 23, 59, 58, 500).getTime()
    expect(millisecondsUntilNextLocalMidnight(timestamp)).toBe(1_500)
  })

  it('refreshes at midnight without restarting the application', () => {
    vi.useFakeTimers()
    const clock = new FakeClock(new Date(2026, 7, 10, 23, 59, 59).getTime())
    const onDateChange = vi.fn()
    const watcher = createLocalDateBoundaryWatcher({ clock, onDateChange })

    clock.timestamp += 1_000
    vi.advanceTimersByTime(1_000)

    expect(onDateChange).toHaveBeenCalledOnce()
    expect(onDateChange).toHaveBeenCalledWith('2026-08-11')
    watcher.dispose()
  })
})
