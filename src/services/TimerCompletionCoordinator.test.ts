import { describe, expect, it, vi } from 'vitest'
import type { TimerCompletedEvent } from '../domain/timer'
import { TimerCompletionCoordinator } from './TimerCompletionCoordinator'

const createCompletion = (mode: 'focus' | 'shortBreak'): TimerCompletedEvent => ({
  type: 'completed',
  eventId: 'completion:session-1',
  sessionId: 'session-1',
  mode,
  startedAt: 1_000,
  completedAt: 61_000,
  occurredAt: 61_000,
  plannedDurationSeconds: 60,
  snapshot: {
    mode: mode === 'focus' ? 'shortBreak' : 'focus',
    status: 'idle',
    remainingSeconds: 60,
    durationSeconds: 60,
    startedAt: null,
    targetEndTime: null,
    sessionId: null,
    completedFocusesInCycle: mode === 'focus' ? 1 : 0,
  },
})

describe('TimerCompletionCoordinator', () => {
  it('applies sound, session and Focus statistics exactly once', () => {
    const coordinator = new TimerCompletionCoordinator()
    let completedPomodoros = 0
    const effects = {
      playSound: vi.fn(),
      recordFocus: vi.fn(() => { completedPomodoros += 1 }),
      recordSession: vi.fn(),
    }
    const event = createCompletion('focus')

    expect(coordinator.handle(event, effects)).toBe(true)
    expect(coordinator.handle(event, effects)).toBe(false)

    expect(effects.playSound).toHaveBeenCalledOnce()
    expect(effects.recordFocus).toHaveBeenCalledOnce()
    expect(effects.recordFocus).toHaveBeenCalledWith(60)
    expect(effects.recordSession).toHaveBeenCalledOnce()
    expect(completedPomodoros).toBe(1)
  })

  it('plays the break completion effect but does not add Focus statistics', () => {
    const coordinator = new TimerCompletionCoordinator()
    const effects = {
      playSound: vi.fn(),
      recordFocus: vi.fn(),
      recordSession: vi.fn(),
    }

    coordinator.handle(createCompletion('shortBreak'), effects)

    expect(effects.playSound).toHaveBeenCalledOnce()
    expect(effects.recordSession).toHaveBeenCalledOnce()
    expect(effects.recordFocus).not.toHaveBeenCalled()
  })
})
