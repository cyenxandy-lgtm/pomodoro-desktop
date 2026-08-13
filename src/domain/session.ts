import type { TimerCompletedEvent, TimerMode, TimerSnapshot } from './timer'
import { getLocalDateKey } from '../utils/localDate'

export type SessionMode = TimerMode

export type SessionStatus = 'completed' | 'cancelled' | 'skipped'

export interface TimerSession {
  id: string
  completionEventId: string | null
  mode: SessionMode
  startedAt: number
  endedAt: number
  plannedDurationSeconds: number
  actualDurationSeconds: number
  status: SessionStatus
  date: string
}

/** Only a natural countdown reaching zero creates a completed session. */
export const createCompletedSession = (event: TimerCompletedEvent): TimerSession => ({
  id: event.sessionId,
  completionEventId: event.eventId,
  mode: event.mode,
  startedAt: event.startedAt,
  endedAt: event.completedAt,
  plannedDurationSeconds: event.plannedDurationSeconds,
  actualDurationSeconds: event.plannedDurationSeconds,
  status: 'completed',
  date: getLocalDateKey(event.completedAt),
})

/** Reset and a paused manual mode switch cancel the active session. */
export const createCancelledSession = (
  snapshot: TimerSnapshot,
  endedAt: number,
): TimerSession | null => {
  if (snapshot.sessionId === null || snapshot.startedAt === null || snapshot.status === 'idle') {
    return null
  }

  return {
    id: snapshot.sessionId,
    completionEventId: null,
    mode: snapshot.mode,
    startedAt: snapshot.startedAt,
    endedAt,
    plannedDurationSeconds: snapshot.durationSeconds,
    actualDurationSeconds: Math.max(
      0,
      Math.min(snapshot.durationSeconds, snapshot.durationSeconds - snapshot.remainingSeconds),
    ),
    status: 'cancelled',
    date: getLocalDateKey(endedAt),
  }
}

export const countsAsCompletedPomodoro = (session: TimerSession): boolean => (
  session.mode === 'focus' && session.status === 'completed'
)
