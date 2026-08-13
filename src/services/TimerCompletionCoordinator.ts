import type { TimerCompletedEvent } from '../domain/timer'

export interface TimerCompletionEffects {
  playSound(): void
  recordFocus(plannedDurationSeconds: number): void
  recordSession?(event: TimerCompletedEvent): void
}

/** In-memory idempotency guard; Phase 2 adds a database uniqueness constraint. */
export class TimerCompletionCoordinator {
  private readonly processedEventIds = new Set<string>()

  handle(event: TimerCompletedEvent, effects: TimerCompletionEffects): boolean {
    if (this.processedEventIds.has(event.eventId)) return false

    // Accept before executing effects so re-entrant or duplicate delivery is safe.
    this.processedEventIds.add(event.eventId)
    effects.recordSession?.(event)
    effects.playSound()
    if (event.mode === 'focus') effects.recordFocus(event.plannedDurationSeconds)
    return true
  }
}
