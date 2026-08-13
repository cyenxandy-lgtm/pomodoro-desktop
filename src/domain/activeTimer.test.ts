import { describe, expect, it } from 'vitest'
import type { TimerSnapshot } from './timer'
import { reconcileActiveTimer, toActiveTimerState } from './activeTimer'

describe('ActiveTimerState', () => {
  it('does not persist idle timers', () => {
    const snapshot: TimerSnapshot = {
      mode: 'focus',
      status: 'idle',
      remainingSeconds: 1_500,
      durationSeconds: 1_500,
      startedAt: null,
      targetEndTime: null,
      sessionId: null,
      completedFocusesInCycle: 0,
    }
    expect(toActiveTimerState(snapshot)).toBeNull()
  })

  it('persists the target for running timers and remaining time for paused timers', () => {
    const running: TimerSnapshot = {
      mode: 'focus',
      status: 'running',
      remainingSeconds: 1_000,
      durationSeconds: 1_500,
      startedAt: 1_000,
      targetEndTime: 1_501_000,
      sessionId: 'session-1',
      completedFocusesInCycle: 0,
    }
    expect(toActiveTimerState(running)).toMatchObject({
      status: 'running',
      targetEndTime: 1_501_000,
    })

    const paused: TimerSnapshot = { ...running, status: 'paused', targetEndTime: null }
    expect(toActiveTimerState(paused)).toMatchObject({
      status: 'paused',
      pausedRemainingSeconds: 1_000,
    })
  })

  it('uses wall-clock semantics after system sleep', () => {
    const state = {
      sessionId: 'session-1',
      mode: 'focus' as const,
      status: 'running' as const,
      startedAt: 1_000,
      targetEndTime: 61_000,
      plannedDurationSeconds: 60,
    }

    expect(reconcileActiveTimer(state, 30_500)).toEqual({
      completed: false,
      remainingSeconds: 31,
    })
    expect(reconcileActiveTimer(state, 90_000)).toEqual({
      completed: true,
      remainingSeconds: 0,
    })
  })
})
