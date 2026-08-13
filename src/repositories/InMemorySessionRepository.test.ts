import { describe, expect, it } from 'vitest'
import type { TimerSession } from '../domain/session'
import { InMemorySessionRepository } from './InMemorySessionRepository'

const session: TimerSession = {
  id: 'session-1',
  completionEventId: 'completion:session-1',
  mode: 'focus',
  startedAt: 1_000,
  endedAt: 61_000,
  plannedDurationSeconds: 60,
  actualDurationSeconds: 60,
  status: 'completed',
  date: '2026-08-10',
}

describe('SessionRepository contract', () => {
  it('rejects a duplicate session id without replacing the first record', async () => {
    const repository = new InMemorySessionRepository()

    expect(await repository.create(session)).toBe('created')
    expect(await repository.create({ ...session, actualDurationSeconds: 1 })).toBe('duplicate')
    expect(await repository.getByDate('2026-08-10')).toEqual([session])
  })
})
