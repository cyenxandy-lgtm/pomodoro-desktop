import type { TimerMode, TimerSnapshot } from './timer'

interface ActiveTimerBase {
  sessionId: string
  mode: TimerMode
  startedAt: number
  plannedDurationSeconds: number
}

export interface RunningActiveTimerState extends ActiveTimerBase {
  status: 'running'
  targetEndTime: number
}

export interface PausedActiveTimerState extends ActiveTimerBase {
  status: 'paused'
  pausedRemainingSeconds: number
}

/** Idle timers are represented by null and do not need persistence. */
export type ActiveTimerState = RunningActiveTimerState | PausedActiveTimerState

export const toActiveTimerState = (snapshot: TimerSnapshot): ActiveTimerState | null => {
  if (snapshot.status === 'idle' || snapshot.sessionId === null || snapshot.startedAt === null) {
    return null
  }

  if (snapshot.status === 'running') {
    if (snapshot.targetEndTime === null) return null
    return {
      sessionId: snapshot.sessionId,
      mode: snapshot.mode,
      status: 'running',
      startedAt: snapshot.startedAt,
      targetEndTime: snapshot.targetEndTime,
      plannedDurationSeconds: snapshot.durationSeconds,
    }
  }

  return {
    sessionId: snapshot.sessionId,
    mode: snapshot.mode,
    status: 'paused',
    startedAt: snapshot.startedAt,
    pausedRemainingSeconds: snapshot.remainingSeconds,
    plannedDurationSeconds: snapshot.durationSeconds,
  }
}

/**
 * Running timers use wall-clock semantics. Sleep does not pause the countdown;
 * a target in the past must be reconciled as completed after wake-up.
 */
export const reconcileActiveTimer = (
  state: ActiveTimerState,
  now: number,
): { completed: boolean; remainingSeconds: number } => {
  if (state.status === 'paused') {
    return { completed: false, remainingSeconds: state.pausedRemainingSeconds }
  }

  const remainingSeconds = Math.max(0, Math.ceil((state.targetEndTime - now) / 1000))
  return { completed: remainingSeconds === 0, remainingSeconds }
}
