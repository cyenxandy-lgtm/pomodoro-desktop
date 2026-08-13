// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeStatisticsSnapshot } from '../domain/statistics'
import type { StatisticsQuery, StatisticsService } from '../services/StatisticsService'
import { useStatistics } from './useStatistics'

class FakeStatisticsService implements StatisticsService {
  calls: StatisticsQuery[] = []
  fail = false

  async getSnapshot(query: StatisticsQuery): Promise<NativeStatisticsSnapshot> {
    this.calls.push(query)
    if (this.fail) throw new Error('database unavailable')
    return {
      daily: [{ date: '2026-08-10', completedPomodoros: 1, focusSeconds: 1_500 }],
      recentSessions: [],
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useStatistics', () => {
  it('loads bounded data and refreshes after a tray/window focus restore', async () => {
    const service = new FakeStatisticsService()
    const { result } = renderHook(() => useStatistics(service, {}, '2026-08-10'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.today.completedPomodoros).toBe(1)
    expect(service.calls[0]).toEqual({
      startDate: null,
      endDate: '2026-08-10',
      recentLimit: 30,
    })

    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(service.calls).toHaveLength(2))
  })

  it('exposes a recoverable error state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const service = new FakeStatisticsService()
    service.fail = true
    const { result } = renderHook(() => useStatistics(service, {}, '2026-08-10'))

    await waitFor(() => expect(result.current.error).toBe(true))
    service.fail = false
    await act(() => result.current.refresh())
    expect(result.current.error).toBe(false)
    expect(result.current.data.today.completedPomodoros).toBe(1)
  })
})
