import type { TimerSession } from './session'
import type { DailyRecords } from '../types'
import { addLocalDays, isDateKey } from '../utils/localDate'

export interface DailyFocusStatistics {
  date: string
  completedPomodoros: number
  focusSeconds: number
}

export interface NativeStatisticsSnapshot {
  daily: DailyFocusStatistics[]
  recentSessions: TimerSession[]
}

export interface StatisticsSummary {
  totalPomodoros: number
  totalFocusSeconds: number
  focusedDays: number
  currentStreak: number
  longestStreak: number
}

export interface StatisticsViewModel {
  today: DailyFocusStatistics
  sevenDays: DailyFocusStatistics[]
  thirtyDays: DailyFocusStatistics[]
  dailyHistory: DailyFocusStatistics[]
  summary: StatisticsSummary
  todaySessions: TimerSession[]
  recentSessions: TimerSession[]
}

const emptyDay = (date: string): DailyFocusStatistics => ({
  date,
  completedPomodoros: 0,
  focusSeconds: 0,
})

const safeWhole = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
)

/** Legacy aggregates and SQLite rows are disjoint facts merged exactly once here. */
export const mergeDailyStatistics = (
  legacyRecords: DailyRecords,
  sqliteDaily: DailyFocusStatistics[],
): DailyFocusStatistics[] => {
  const merged = new Map<string, DailyFocusStatistics>()
  for (const record of Object.values(legacyRecords)) {
    if (!isDateKey(record.date)) continue
    merged.set(record.date, {
      date: record.date,
      completedPomodoros: safeWhole(record.completedPomodoros),
      focusSeconds: safeWhole(record.focusMinutes) * 60,
    })
  }
  for (const record of sqliteDaily) {
    if (!isDateKey(record.date)) continue
    const current = merged.get(record.date) ?? emptyDay(record.date)
    merged.set(record.date, {
      date: record.date,
      completedPomodoros: current.completedPomodoros
        + safeWhole(record.completedPomodoros),
      focusSeconds: current.focusSeconds + safeWhole(record.focusSeconds),
    })
  }
  return [...merged.values()].sort((left, right) => left.date.localeCompare(right.date))
}

export const fillDailyRange = (
  daily: DailyFocusStatistics[],
  endDate: string,
  dayCount: number,
): DailyFocusStatistics[] => {
  if (!isDateKey(endDate) || dayCount <= 0) return []
  const records = new Map(daily.map((record) => [record.date, record]))
  const range: DailyFocusStatistics[] = []
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = addLocalDays(endDate, -offset)
    if (date) range.push(records.get(date) ?? emptyDay(date))
  }
  return range
}

export const calculateStreaks = (
  daily: DailyFocusStatistics[],
  today: string,
): Pick<StatisticsSummary, 'currentStreak' | 'longestStreak'> => {
  const focusedDates = [...new Set(
    daily
      .filter((record) => record.completedPomodoros > 0 && isDateKey(record.date))
      .map((record) => record.date),
  )].sort()
  const focused = new Set(focusedDates)

  let longestStreak = 0
  let run = 0
  let previous: string | null = null
  for (const date of focusedDates) {
    run = previous !== null && addLocalDays(previous, 1) === date ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    previous = date
  }

  const yesterday = addLocalDays(today, -1)
  let cursor = focused.has(today) ? today : yesterday && focused.has(yesterday) ? yesterday : null
  let currentStreak = 0
  while (cursor && focused.has(cursor)) {
    currentStreak += 1
    cursor = addLocalDays(cursor, -1)
  }
  return { currentStreak, longestStreak }
}

export const buildStatisticsViewModel = (
  daily: DailyFocusStatistics[],
  recentSessions: TimerSession[],
  today: string,
): StatisticsViewModel => {
  const historical = daily.filter((record) => isDateKey(record.date) && record.date <= today)
  const streaks = calculateStreaks(historical, today)
  const summary = historical.reduce<StatisticsSummary>((result, record) => ({
    ...result,
    totalPomodoros: result.totalPomodoros + record.completedPomodoros,
    totalFocusSeconds: result.totalFocusSeconds + record.focusSeconds,
    focusedDays: result.focusedDays + (record.completedPomodoros > 0 ? 1 : 0),
  }), {
    totalPomodoros: 0,
    totalFocusSeconds: 0,
    focusedDays: 0,
    ...streaks,
  })
  const sortedSessions = [...recentSessions].sort((left, right) => right.endedAt - left.endedAt)

  return {
    today: historical.find((record) => record.date === today) ?? emptyDay(today),
    sevenDays: fillDailyRange(historical, today, 7),
    thirtyDays: fillDailyRange(historical, today, 30),
    dailyHistory: [...historical]
      .filter((record) => record.completedPomodoros > 0)
      .reverse()
      .slice(0, 30),
    summary,
    todaySessions: sortedSessions.filter((session) => session.date === today),
    recentSessions: sortedSessions.slice(0, 30),
  }
}

export const formatFocusDuration = (seconds: number): string => {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}小时` : `${hours}小时 ${remainder}分钟`
}
