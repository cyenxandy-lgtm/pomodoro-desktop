import { describe, expect, it } from 'vitest'
import { getRecentRecords, mergeDailyRecords, recordFocusCompletion } from './dailyStats'
import { getDailyRecord } from './storage'

describe('daily statistics', () => {
  it('records the first Focus and keeps the input immutable', () => {
    const initial = {}
    const result = recordFocusCompletion(initial, '2026-08-10', 25)

    expect(initial).toEqual({})
    expect(result['2026-08-10']).toEqual({
      date: '2026-08-10',
      completedPomodoros: 1,
      focusMinutes: 25,
    })
  })

  it('accumulates multiple Focus completions on the same date', () => {
    const once = recordFocusCompletion({}, '2026-08-10', 50)
    const twice = recordFocusCompletion(once, '2026-08-10', 25)

    expect(twice['2026-08-10'].completedPomodoros).toBe(2)
    expect(twice['2026-08-10'].focusMinutes).toBe(75)
  })

  it('shows only non-empty records from the most recent 30 calendar days', () => {
    const records = {
      '2026-08-10': { date: '2026-08-10', completedPomodoros: 2, focusMinutes: 50 },
      '2026-08-01': { date: '2026-08-01', completedPomodoros: 1, focusMinutes: 25 },
      '2026-07-11': { date: '2026-07-11', completedPomodoros: 5, focusMinutes: 125 },
      '2026-08-09': { date: '2026-08-09', completedPomodoros: 0, focusMinutes: 0 },
    }

    expect(getRecentRecords(records, '2026-08-10').map((record) => record.date)).toEqual([
      '2026-08-10',
      '2026-08-01',
    ])
  })

  it('shows a fresh Today record after midnight without deleting yesterday', () => {
    const records = {
      '2026-08-10': { date: '2026-08-10', completedPomodoros: 3, focusMinutes: 75 },
    }

    expect(getDailyRecord(records, '2026-08-11')).toEqual({
      date: '2026-08-11',
      completedPomodoros: 0,
      focusMinutes: 0,
    })
    expect(records['2026-08-10'].completedPomodoros).toBe(3)
  })

  it('combines immutable legacy aggregates with real SQLite session aggregates', () => {
    const legacy = {
      '2026-08-10': { date: '2026-08-10', completedPomodoros: 2, focusMinutes: 50 },
    }
    const sessions = {
      '2026-08-10': { date: '2026-08-10', completedPomodoros: 1, focusMinutes: 25 },
      '2026-08-11': { date: '2026-08-11', completedPomodoros: 3, focusMinutes: 75 },
    }

    expect(mergeDailyRecords(legacy, sessions)).toEqual({
      '2026-08-10': { date: '2026-08-10', completedPomodoros: 3, focusMinutes: 75 },
      '2026-08-11': { date: '2026-08-11', completedPomodoros: 3, focusMinutes: 75 },
    })
    expect(legacy['2026-08-10'].completedPomodoros).toBe(2)
  })
})
