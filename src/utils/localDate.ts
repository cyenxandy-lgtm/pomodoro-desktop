import type { Clock } from '../domain/timer'
import { systemClock } from '../domain/timer'

export const getLocalDateKey = (timestamp = Date.now()): string => {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const isDateKey = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
)

export const millisecondsUntilNextLocalMidnight = (timestamp: number): number => {
  const now = new Date(timestamp)
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime()
  return Math.max(1, nextMidnight - timestamp)
}

export interface TimeoutScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

const browserTimeoutScheduler: TimeoutScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
}

interface LocalDateBoundaryOptions {
  onDateChange: (dateKey: string) => void
  clock?: Clock
  scheduler?: TimeoutScheduler
  windowTarget?: Window
  documentTarget?: Document
}

export interface LocalDateBoundaryWatcher {
  getCurrentDateKey(): string
  reconcile(): void
  dispose(): void
}

export const createLocalDateBoundaryWatcher = (
  options: LocalDateBoundaryOptions,
): LocalDateBoundaryWatcher => {
  const clock = options.clock ?? systemClock
  const scheduler = options.scheduler ?? browserTimeoutScheduler
  const windowTarget = options.windowTarget ?? window
  const documentTarget = options.documentTarget ?? document
  let currentDateKey = getLocalDateKey(clock.now())
  let timeoutHandle: unknown = null

  const clearScheduledBoundary = () => {
    if (timeoutHandle === null) return
    scheduler.clearTimeout(timeoutHandle)
    timeoutHandle = null
  }

  const scheduleNextBoundary = () => {
    clearScheduledBoundary()
    timeoutHandle = scheduler.setTimeout(() => {
      timeoutHandle = null
      reconcile()
    }, millisecondsUntilNextLocalMidnight(clock.now()))
  }

  const reconcile = () => {
    const nextDateKey = getLocalDateKey(clock.now())
    if (nextDateKey !== currentDateKey) {
      currentDateKey = nextDateKey
      options.onDateChange(nextDateKey)
    }
    scheduleNextBoundary()
  }

  const handleVisibilityChange = () => {
    if (documentTarget.visibilityState === 'visible') reconcile()
  }
  const handleFocus = () => reconcile()

  documentTarget.addEventListener('visibilitychange', handleVisibilityChange)
  windowTarget.addEventListener('focus', handleFocus)
  scheduleNextBoundary()

  return {
    getCurrentDateKey: () => currentDateKey,
    reconcile,
    dispose: () => {
      clearScheduledBoundary()
      documentTarget.removeEventListener('visibilitychange', handleVisibilityChange)
      windowTarget.removeEventListener('focus', handleFocus)
    },
  }
}
