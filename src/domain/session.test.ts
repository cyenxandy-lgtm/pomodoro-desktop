import { describe, expect, it } from 'vitest'
import type { TimerCompletedEvent, TimerSnapshot } from './timer'
import {
  countsAsCompletedPomodoro,
  createCancelledSession,
  createCompletedSession,
} from './session'

const completedEvent = (mode: 'focus' | 'shortBreak'): TimerCompletedEvent => ({
  type: 'completed',
  eventId: 'completion:session-1',
  sessionId: 'session-1',
  mode,
  startedAt: new Date(2026, 7, 10, 9, 0).getTime(),
  completedAt: new Date(2026, 7, 10, 9, 25).getTime(),
  occurredAt: new Date(2026, 7, 10, 9, 25).getTime(),
  plannedDurationSeconds: 1_500,
  snapshot: {
    mode: 'shortBreak',
    status: 'idle',
    remainingSeconds: 300,
    durationSeconds: 300,
    startedAt: null,
    targetEndTime: null,
    sessionId: null,
    completedFocusesInCycle: mode === 'focus' ? 1 : 0,
  },
})

describe('TimerSession semantics', () => {
  it('creates completed sessions only from natural completion events', () => {
    const session = createCompletedSession(completedEvent('focus'))
    expect(session).toMatchObject({
      id: 'session-1',
      completionEventId: 'completion:session-1',
      mode: 'focus',
      plannedDurationSeconds: 1_500,
      actualDurationSeconds: 1_500,
      status: 'completed',
      date: '2026-08-10',
    })
    expect(countsAsCompletedPomodoro(session)).toBe(true)
  })

  it('does not count completed breaks as Pomodoros', () => {
    const session = createCompletedSession(completedEvent('shortBreak'))
    expect(session.status).toBe('completed')
    expect(countsAsCompletedPomodoro(session)).toBe(false)
  })

  it('models Reset and paused mode changes as cancellation', () => {
    const snapshot: TimerSnapshot = {
      mode: 'focus',
      status: 'paused',
      remainingSeconds: 1_000,
      durationSeconds: 1_500,
      startedAt: new Date(2026, 7, 10, 9, 0).getTime(),
      targetEndTime: null,
      sessionId: 'session-1',
      completedFocusesInCycle: 0,
    }
    const session = createCancelledSession(
      snapshot,
      new Date(2026, 7, 10, 9, 9).getTime(),
    )

    expect(session).toMatchObject({
      status: 'cancelled',
      actualDurationSeconds: 500,
      completionEventId: null,
    })
    expect(countsAsCompletedPomodoro(session!)).toBe(false)
  })

  it('does not fabricate a session from idle aggregate data', () => {
    const idleSnapshot: TimerSnapshot = {
      mode: 'focus',
      status: 'idle',
      remainingSeconds: 1_500,
      durationSeconds: 1_500,
      startedAt: null,
      targetEndTime: null,
      sessionId: null,
      completedFocusesInCycle: 0,
    }

    expect(createCancelledSession(idleSnapshot, Date.now())).toBeNull()
  })
})
