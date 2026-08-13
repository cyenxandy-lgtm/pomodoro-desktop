import type { TimerSession } from '../domain/session'

export type CreateSessionResult = 'created' | 'duplicate'

/**
 * Persistence adapters must enforce unique TimerSession.id values. The Phase 2
 * SQLite adapter will implement this contract without changing App.tsx.
 */
export interface SessionRepository {
  create(session: TimerSession): Promise<CreateSessionResult>
  update(session: TimerSession): Promise<void>
  getByDate(date: string): Promise<TimerSession[]>
  getRecent(limit: number): Promise<TimerSession[]>
}
