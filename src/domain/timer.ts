export type TimerMode = 'focus' | 'shortBreak' | 'longBreak'

export type TimerStatus = 'idle' | 'running' | 'paused'

export interface TimerSettings {
  focusMinutes: number
  breakMinutes: number
  longBreakMinutes: number
  longBreakInterval: number
  autoStartBreak: boolean
  autoStartFocus: boolean
}

/**
 * The UI consumes this snapshot without knowing whether the timer engine is
 * implemented by JavaScript or, in Phase 2, by Rust.
 */
export interface TimerSnapshot {
  mode: TimerMode
  status: TimerStatus
  remainingSeconds: number
  durationSeconds: number
  startedAt: number | null
  targetEndTime: number | null
  sessionId: string | null
  completedFocusesInCycle: number
}

interface TimerEventBase {
  eventId: string
  occurredAt: number
  snapshot: TimerSnapshot
}

export interface TimerStartedEvent extends TimerEventBase {
  type: 'started'
  sessionId: string
}

export interface TimerPausedEvent extends TimerEventBase {
  type: 'paused'
  sessionId: string
}

export interface TimerResumedEvent extends TimerEventBase {
  type: 'resumed'
  sessionId: string
}

export interface TimerResetEvent extends TimerEventBase {
  type: 'reset'
  cancelledSessionId: string | null
}

export interface TimerSkippedEvent extends TimerEventBase {
  type: 'skipped'
  previousMode: TimerMode
  skippedSessionId: string
}

export interface TimerTickEvent extends TimerEventBase {
  type: 'tick'
}

export interface TimerModeChangedEvent extends TimerEventBase {
  type: 'modeChanged'
  previousMode: TimerMode
  cancelledSessionId: string | null
}

/**
 * Completion is the only one-shot business event. eventId is stable for the
 * session so at-least-once delivery can still produce exactly-once effects.
 */
export interface TimerCompletedEvent extends TimerEventBase {
  type: 'completed'
  eventId: string
  sessionId: string
  mode: TimerMode
  startedAt: number
  completedAt: number
  plannedDurationSeconds: number
}

export type TimerEvent =
  | TimerStartedEvent
  | TimerPausedEvent
  | TimerResumedEvent
  | TimerResetEvent
  | TimerSkippedEvent
  | TimerTickEvent
  | TimerModeChangedEvent
  | TimerCompletedEvent

export type TimerEventListener = (event: TimerEvent) => void

export interface Clock {
  now(): number
}

export const systemClock: Clock = {
  now: () => Date.now(),
}

export interface TimerService {
  start(): void | Promise<void>
  pause(): void | Promise<void>
  resume(): void | Promise<void>
  reset(): void | Promise<void>
  skip(): void | Promise<void>
  selectMode(mode: TimerMode): void | Promise<void>
  configure(settings: TimerSettings): void | Promise<void>
  reconcile(): void | Promise<void>
  getSnapshot(): TimerSnapshot
  subscribe(listener: TimerEventListener): () => void
}
