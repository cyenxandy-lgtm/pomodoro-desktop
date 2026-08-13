// @vitest-environment jsdom

import { StrictMode } from 'react'
import type { PropsWithChildren } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTimer } from './useTimer'

const strictModeWrapper = ({ children }: PropsWithChildren) => (
  <StrictMode>{children}</StrictMode>
)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useTimer', () => {
  it('delivers one completion under StrictMode and repeated interval ticks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0))
    const onComplete = vi.fn()
    const { result, unmount } = renderHook(() => useTimer({
      settings: {
        focusMinutes: 1,
        breakMinutes: 1,
        longBreakMinutes: 1,
        longBreakInterval: 4,
        autoStartBreak: false,
        autoStartFocus: false,
      },
      onComplete,
    }), { wrapper: strictModeWrapper })

    act(() => result.current.start())
    act(() => vi.advanceTimersByTime(61_000))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(result.current).toMatchObject({
      mode: 'shortBreak',
      status: 'idle',
      remainingSeconds: 60,
      targetEndTime: null,
    })
    unmount()
  })

  it('reconciles a suspended timer when visibility returns', () => {
    vi.useFakeTimers()
    const startedAt = new Date(2026, 7, 10, 12, 0, 0)
    vi.setSystemTime(startedAt)
    const onComplete = vi.fn()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const { result, unmount } = renderHook(() => useTimer({
      settings: {
        focusMinutes: 1,
        breakMinutes: 1,
        longBreakMinutes: 1,
        longBreakInterval: 4,
        autoStartBreak: false,
        autoStartFocus: false,
      },
      onComplete,
    }))

    act(() => result.current.start())
    vi.setSystemTime(startedAt.getTime() + 61_000)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(result.current.mode).toBe('shortBreak')
    unmount()
  })
})
