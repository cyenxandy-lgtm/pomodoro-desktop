import type { TimerSession } from '../domain/session'
import type { CreateSessionResult, SessionRepository } from './SessionRepository'

/** Test/reference adapter; production persistence remains legacy V2 in Phase 1. */
export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, TimerSession>()

  async create(session: TimerSession): Promise<CreateSessionResult> {
    if (this.sessions.has(session.id)) return 'duplicate'
    this.sessions.set(session.id, { ...session })
    return 'created'
  }

  async update(session: TimerSession): Promise<void> {
    if (!this.sessions.has(session.id)) {
      throw new Error(`Cannot update unknown session: ${session.id}`)
    }
    this.sessions.set(session.id, { ...session })
  }

  async getByDate(date: string): Promise<TimerSession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.date === date)
      .map((session) => ({ ...session }))
  }

  async getRecent(limit: number): Promise<TimerSession[]> {
    if (limit <= 0) return []
    return [...this.sessions.values()]
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, limit)
      .map((session) => ({ ...session }))
  }
}
