import type {
  Clock,
  TimerCompletedEvent,
  TimerEvent,
  TimerEventListener,
  TimerMode,
  TimerService,
  TimerSettings,
  TimerSnapshot,
} from '../domain/timer'
import { systemClock } from '../domain/timer'
import { getDurationSeconds } from '../utils/timer'

export interface IntervalScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown
  clearInterval(handle: unknown): void
}

const browserScheduler: IntervalScheduler = {
  setInterval: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
  clearInterval: (handle) => globalThis.clearInterval(handle as number),
}

interface WebTimerServiceOptions {
  settings: TimerSettings
  clock?: Clock
  scheduler?: IntervalScheduler
  createId?: () => string
  tickIntervalMs?: number
}

const createIdleSnapshot = (
  mode: TimerMode,
  settings: TimerSettings,
  completedFocusesInCycle = 0,
): TimerSnapshot => {
  const durationSeconds = getDurationSeconds(mode, settings)
  return {
    mode,
    status: 'idle',
    remainingSeconds: durationSeconds,
    durationSeconds,
    startedAt: null,
    targetEndTime: null,
    sessionId: null,
    completedFocusesInCycle,
  }
}

/** WebView implementation of TimerService. Phase 2 can replace this adapter. */
export class WebTimerService implements TimerService {
  private settings: TimerSettings
  private snapshot: TimerSnapshot
  private readonly clock: Clock
  private readonly scheduler: IntervalScheduler
  private readonly createId: () => string
  private readonly tickIntervalMs: number
  private readonly listeners = new Set<TimerEventListener>()
  private intervalHandle: unknown = null
  private idSequence = 0

  constructor(options: WebTimerServiceOptions) {
    this.settings = { ...options.settings }
    this.clock = options.clock ?? systemClock
    this.scheduler = options.scheduler ?? browserScheduler
    this.tickIntervalMs = options.tickIntervalMs ?? 250
    this.createId = options.createId ?? (() => this.createFallbackId())
    this.snapshot = createIdleSnapshot('focus', this.settings)
  }

  getSnapshot = (): TimerSnapshot => this.snapshot

  subscribe = (listener: TimerEventListener): (() => void) => {
    this.listeners.add(listener)
    if (this.snapshot.status === 'running') {
      this.reconcile()
      this.ensureInterval()
    }

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stopInterval()
    }
  }

  configure = (settings: TimerSettings): void => {
    this.settings = { ...settings }
    if (this.snapshot.status !== 'idle') return

    const nextSnapshot = createIdleSnapshot(this.snapshot.mode, this.settings)
    if (nextSnapshot.durationSeconds === this.snapshot.durationSeconds) return

    this.snapshot = nextSnapshot
    this.emit({
      type: 'tick',
      eventId: this.nextEventId('configured'),
      occurredAt: this.clock.now(),
      snapshot: this.snapshot,
    })
  }

  start = (): void => {
    if (this.snapshot.status !== 'idle' || this.snapshot.remainingSeconds <= 0) return

    const startedAt = this.clock.now()
    const sessionId = this.nextEventId('session')
    this.snapshot = {
      ...this.snapshot,
      status: 'running',
      durationSeconds: this.snapshot.remainingSeconds,
      startedAt,
      targetEndTime: startedAt + this.snapshot.remainingSeconds * 1000,
      sessionId,
    }
    this.emit({
      type: 'started',
      eventId: this.nextEventId('started'),
      occurredAt: startedAt,
      sessionId,
      snapshot: this.snapshot,
    })
    this.ensureInterval()
  }

  pause = (): void => {
    if (this.snapshot.status !== 'running') return

    this.reconcile()
    if (this.snapshot.status !== 'running' || this.snapshot.targetEndTime === null) return

    const now = this.clock.now()
    const remainingSeconds = this.calculateRemainingSeconds(this.snapshot.targetEndTime, now)
    const sessionId = this.snapshot.sessionId
    if (sessionId === null) return

    this.snapshot = {
      ...this.snapshot,
      status: 'paused',
      remainingSeconds,
      targetEndTime: null,
    }
    this.stopInterval()
    this.emit({
      type: 'paused',
      eventId: this.nextEventId('paused'),
      occurredAt: now,
      sessionId,
      snapshot: this.snapshot,
    })
  }

  resume = (): void => {
    if (this.snapshot.status !== 'paused' || this.snapshot.remainingSeconds <= 0) return

    const now = this.clock.now()
    const sessionId = this.snapshot.sessionId
    if (sessionId === null) return

    this.snapshot = {
      ...this.snapshot,
      status: 'running',
      targetEndTime: now + this.snapshot.remainingSeconds * 1000,
    }
    this.emit({
      type: 'resumed',
      eventId: this.nextEventId('resumed'),
      occurredAt: now,
      sessionId,
      snapshot: this.snapshot,
    })
    this.ensureInterval()
  }

  reset = (): void => {
    const cancelledSessionId = this.snapshot.sessionId
    this.stopInterval()
    this.snapshot = createIdleSnapshot(
      this.snapshot.mode,
      this.settings,
      this.snapshot.completedFocusesInCycle,
    )
    this.emit({
      type: 'reset',
      eventId: this.nextEventId('reset'),
      occurredAt: this.clock.now(),
      cancelledSessionId,
      snapshot: this.snapshot,
    })
  }

  skip = (): void => {
    if (this.snapshot.status === 'idle' || this.snapshot.sessionId === null) return

    const previousMode = this.snapshot.mode
    const skippedSessionId = this.snapshot.sessionId
    const nextMode = previousMode === 'focus' ? 'shortBreak' : 'focus'
    const cycle = previousMode === 'longBreak' ? 0 : this.snapshot.completedFocusesInCycle
    this.stopInterval()
    this.snapshot = createIdleSnapshot(nextMode, this.settings, cycle)
    this.emit({
      type: 'skipped',
      eventId: this.nextEventId('skipped'),
      occurredAt: this.clock.now(),
      previousMode,
      skippedSessionId,
      snapshot: this.snapshot,
    })
  }

  selectMode = (mode: TimerMode): void => {
    if (this.snapshot.status === 'running' || mode === this.snapshot.mode) return

    const previousMode = this.snapshot.mode
    const cancelledSessionId = this.snapshot.sessionId
    this.stopInterval()
    this.snapshot = createIdleSnapshot(mode, this.settings, this.snapshot.completedFocusesInCycle)
    this.emit({
      type: 'modeChanged',
      eventId: this.nextEventId('mode-changed'),
      occurredAt: this.clock.now(),
      previousMode,
      cancelledSessionId,
      snapshot: this.snapshot,
    })
  }

  /**
   * Wall-clock semantics: if the current time passed targetEndTime while the
   * computer slept or the WebView was suspended, reconciliation completes it.
   */
  reconcile = (): void => {
    if (this.snapshot.status !== 'running' || this.snapshot.targetEndTime === null) return

    const now = this.clock.now()
    const remainingSeconds = this.calculateRemainingSeconds(this.snapshot.targetEndTime, now)
    if (remainingSeconds <= 0) {
      this.finish(now)
      return
    }

    if (remainingSeconds === this.snapshot.remainingSeconds) return
    this.snapshot = { ...this.snapshot, remainingSeconds }
    this.emit({
      type: 'tick',
      eventId: this.nextEventId('tick'),
      occurredAt: now,
      snapshot: this.snapshot,
    })
  }

  private finish(reconciledAt: number): void {
    const completedSnapshot = this.snapshot
    const { sessionId, startedAt, targetEndTime } = completedSnapshot
    if (
      completedSnapshot.status !== 'running' ||
      targetEndTime === null ||
      sessionId === null ||
      startedAt === null
    ) return

    const nextCycle = completedSnapshot.mode === 'focus'
      ? completedSnapshot.completedFocusesInCycle + 1
      : completedSnapshot.mode === 'longBreak'
        ? 0
        : completedSnapshot.completedFocusesInCycle
    const nextMode: TimerMode = completedSnapshot.mode === 'focus'
      ? nextCycle >= this.settings.longBreakInterval ? 'longBreak' : 'shortBreak'
      : 'focus'
    const shouldAutoStart = completedSnapshot.mode === 'focus'
      ? this.settings.autoStartBreak
      : this.settings.autoStartFocus

    // Clear all completion-capable state before delivering the event.
    this.stopInterval()
    this.snapshot = createIdleSnapshot(nextMode, this.settings, nextCycle)
    if (shouldAutoStart) {
      const sessionId = this.nextEventId('session')
      this.snapshot = {
        ...this.snapshot,
        status: 'running',
        startedAt: reconciledAt,
        targetEndTime: reconciledAt + this.snapshot.remainingSeconds * 1000,
        sessionId,
      }
    }
    const event: TimerCompletedEvent = {
      type: 'completed',
      eventId: `completion:${sessionId}`,
      occurredAt: reconciledAt,
      sessionId,
      mode: completedSnapshot.mode,
      startedAt,
      // Business time is the planned wall-clock boundary, not delayed delivery.
      completedAt: targetEndTime,
      plannedDurationSeconds: completedSnapshot.durationSeconds,
      snapshot: this.snapshot,
    }
    this.emit(event)
    if (this.snapshot.status === 'running') this.ensureInterval()
  }

  private calculateRemainingSeconds(targetEndTime: number, now: number): number {
    return Math.max(0, Math.ceil((targetEndTime - now) / 1000))
  }

  private ensureInterval(): void {
    if (
      this.intervalHandle !== null ||
      this.listeners.size === 0 ||
      this.snapshot.status !== 'running'
    ) return

    this.intervalHandle = this.scheduler.setInterval(() => this.reconcile(), this.tickIntervalMs)
  }

  private stopInterval(): void {
    if (this.intervalHandle === null) return
    this.scheduler.clearInterval(this.intervalHandle)
    this.intervalHandle = null
  }

  private emit(event: TimerEvent): void {
    for (const listener of [...this.listeners]) listener(event)
  }

  private nextEventId(prefix: string): string {
    return `${prefix}:${this.createId()}`
  }

  private createFallbackId(): string {
    this.idSequence += 1
    const randomId = globalThis.crypto?.randomUUID?.()
    return randomId ?? `${this.clock.now()}-${this.idSequence}`
  }
}
