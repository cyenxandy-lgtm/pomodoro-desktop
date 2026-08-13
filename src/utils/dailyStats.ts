import type { DailyRecord, DailyRecords } from '../types'
import { getLocalDateKey, isDateKey } from './localDate'

const toLocalDate = (dateKey: string): Date | null => {
  if (!isDateKey(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null
}

export const recordFocusCompletion = (
  records: DailyRecords,
  date: string,
  focusMinutes: number,
): DailyRecords => {
  const current = records[date] ?? { date, completedPomodoros: 0, focusMinutes: 0 }
  const safeMinutes = Number.isFinite(focusMinutes) ? Math.max(0, Math.round(focusMinutes)) : 0

  return {
    ...records,
    [date]: {
      date,
      completedPomodoros: current.completedPomodoros + 1,
      focusMinutes: current.focusMinutes + safeMinutes,
    },
  }
}

/** Legacy aggregate history and native session aggregates are disjoint sources. */
export const mergeDailyRecords = (
  legacyRecords: DailyRecords,
  sessionRecords: DailyRecords,
): DailyRecords => {
  const merged: DailyRecords = { ...legacyRecords }
  for (const [date, sessionRecord] of Object.entries(sessionRecords)) {
    const legacyRecord = merged[date]
    merged[date] = {
      date,
      completedPomodoros: (legacyRecord?.completedPomodoros ?? 0)
        + sessionRecord.completedPomodoros,
      focusMinutes: (legacyRecord?.focusMinutes ?? 0) + sessionRecord.focusMinutes,
    }
  }
  return merged
}

export const getRecentRecords = (
  records: DailyRecords,
  today = getLocalDateKey(),
  dayLimit = 30,
): DailyRecord[] => {
  const todayDate = toLocalDate(today)
  if (!todayDate || dayLimit <= 0) return []

  const earliestDate = new Date(todayDate)
  earliestDate.setDate(earliestDate.getDate() - (dayLimit - 1))

  return Object.values(records)
    .filter((record) => {
      const date = toLocalDate(record.date)
      return Boolean(
        date &&
        record.completedPomodoros > 0 &&
        date >= earliestDate &&
        date <= todayDate,
      )
    })
    .sort((left, right) => right.date.localeCompare(left.date))
}
