import { describe, expect, it } from 'vitest'
import type { TimerSession } from './session'
import {
  buildStatisticsViewModel,
  calculateStreaks,
  fillDailyRange,
  formatFocusDuration,
  mergeDailyStatistics,
} from './statistics'
import type { DailyFocusStatistics } from './statistics'

const day = (date: string, count = 1, seconds = count * 1_500): DailyFocusStatistics => ({
  date,
  completedPomodoros: count,
  focusSeconds: seconds,
})

const session: TimerSession = {
  id: 'session-1',
  completionEventId: 'completion-1',
  mode: 'focus',
  startedAt: 1_000,
  endedAt: 2_000,
  plannedDurationSeconds: 1_500,
  actualDurationSeconds: 1_500,
  status: 'completed',
  date: '2026-08-10',
}

describe('statistics domain', () => {
  it('merges legacy-only, SQLite-only and same-day data in seconds', () => {
    const merged = mergeDailyStatistics({
      '2026-08-09': { date: '2026-08-09', completedPomodoros: 1, focusMinutes: 25 },
      '2026-08-10': { date: '2026-08-10', completedPomodoros: 3, focusMinutes: 75 },
    }, [day('2026-08-10', 2, 3_000), day('2026-08-11', 1, 1_500)])

    expect(merged).toEqual([
      day('2026-08-09', 1, 1_500),
      day('2026-08-10', 5, 7_500),
      day('2026-08-11', 1, 1_500),
    ])
    expect(mergeDailyStatistics({}, [])).toEqual([])
  })

  it('fills zero days for seven and thirty day ranges', () => {
    expect(fillDailyRange([day('2026-08-10', 2)], '2026-08-10', 7)).toHaveLength(7)
    const thirty = fillDailyRange([], '2026-08-10', 30)
    expect(thirty).toHaveLength(30)
    expect(thirty.every((record) => record.completedPomodoros === 0)).toBe(true)
  })

  it.each([
    ['single day', [day('2026-08-10')], '2026-08-10', 1, 1],
    ['two days', [day('2026-08-09'), day('2026-08-10')], '2026-08-10', 2, 2],
    ['ten days', Array.from({ length: 10 }, (_, index) => day(`2026-08-${String(index + 1).padStart(2, '0')}`)), '2026-08-10', 10, 10],
    ['gap', [day('2026-08-07'), day('2026-08-09'), day('2026-08-10')], '2026-08-10', 2, 2],
    ['today empty but yesterday focused', [day('2026-08-08'), day('2026-08-09')], '2026-08-10', 2, 2],
    ['today and yesterday empty', [day('2026-08-08')], '2026-08-10', 0, 1],
    ['cross month', [day('2026-07-31'), day('2026-08-01')], '2026-08-01', 2, 2],
    ['cross year', [day('2026-12-31'), day('2027-01-01')], '2027-01-01', 2, 2],
    ['leap year', [day('2028-02-28'), day('2028-02-29'), day('2028-03-01')], '2028-03-01', 3, 3],
  ])('%s streak semantics', (_name, records, today, current, longest) => {
    expect(calculateStreaks(records, today)).toEqual({
      currentStreak: current,
      longestStreak: longest,
    })
  })

  it('keeps streak continuous across the legacy and SQLite boundary', () => {
    const merged = mergeDailyStatistics({
      '2026-08-01': { date: '2026-08-01', completedPomodoros: 1, focusMinutes: 25 },
      '2026-08-02': { date: '2026-08-02', completedPomodoros: 1, focusMinutes: 25 },
    }, [day('2026-08-03'), day('2026-08-04')])
    expect(calculateStreaks(merged, '2026-08-04')).toEqual({
      currentStreak: 4,
      longestStreak: 4,
    })
  })

  it('derives today, all-time and recent sessions from merged facts', () => {
    const model = buildStatisticsViewModel(
      [day('2026-08-09', 2, 3_000), day('2026-08-10', 3, 4_500)],
      [{ ...session, endedAt: 3_000 }, { ...session, id: 'older', endedAt: 2_000 }],
      '2026-08-10',
    )
    expect(model.today).toEqual(day('2026-08-10', 3, 4_500))
    expect(model.summary).toMatchObject({
      totalPomodoros: 5,
      totalFocusSeconds: 7_500,
      focusedDays: 2,
      currentStreak: 2,
      longestStreak: 2,
    })
    expect(model.recentSessions.map((record) => record.endedAt)).toEqual([3_000, 2_000])
    expect(model.todaySessions).toHaveLength(2)
  })

  it('never fabricates sessions from legacy aggregate history', () => {
    const merged = mergeDailyStatistics({
      '2026-08-10': { date: '2026-08-10', completedPomodoros: 4, focusMinutes: 100 },
    }, [])
    const model = buildStatisticsViewModel(merged, [], '2026-08-10')

    expect(model.summary.totalPomodoros).toBe(4)
    expect(model.recentSessions).toEqual([])
    expect(model.todaySessions).toEqual([])
  })

  it('formats minute and all-time hour durations consistently', () => {
    expect(formatFocusDuration(2_700)).toBe('45分钟')
    expect(formatFocusDuration(8_100)).toBe('2小时 15分钟')
    expect(formatFocusDuration(489_000)).toBe('135小时 50分钟')
  })
})
