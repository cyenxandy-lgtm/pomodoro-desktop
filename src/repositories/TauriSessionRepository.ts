import { invoke } from '@tauri-apps/api/core'
import type { TimerSession } from '../domain/session'
import type { DailyRecord, DailyRecords } from '../types'
import type { CreateSessionResult, SessionRepository } from './SessionRepository'

interface NativeDailyRecord {
  date: string
  completedPomodoros: number
  focusMinutes: number
}

export class TauriSessionRepository implements SessionRepository {
  create = (session: TimerSession): Promise<CreateSessionResult> => (
    invoke<CreateSessionResult>('session_create', { session })
  )

  update = (session: TimerSession): Promise<void> => (
    invoke<void>('session_update', { session })
  )

  getByDate = (date: string): Promise<TimerSession[]> => (
    invoke<TimerSession[]>('session_get_by_date', { date })
  )

  getRecent = (limit: number): Promise<TimerSession[]> => (
    invoke<TimerSession[]>('session_get_recent', { limit })
  )

  async getDailyRecords(): Promise<DailyRecords> {
    const records = await invoke<NativeDailyRecord[]>('session_get_daily_records')
    return Object.fromEntries(records.map((record): [string, DailyRecord] => [
      record.date,
      {
        date: record.date,
        completedPomodoros: record.completedPomodoros,
        focusMinutes: record.focusMinutes,
      },
    ]))
  }
}
