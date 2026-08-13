import { describe, expect, it } from 'vitest'
import { formatTime, getDurationSeconds } from './timer'

describe('timer utilities', () => {
  it('converts configured minutes to seconds for each mode', () => {
    const settings = {
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartBreak: false,
      autoStartFocus: false,
    }

    expect(getDurationSeconds('focus', settings)).toBe(1500)
    expect(getDurationSeconds('shortBreak', settings)).toBe(300)
    expect(getDurationSeconds('longBreak', settings)).toBe(900)
  })

  it('formats times with stable two-digit segments', () => {
    expect(formatTime(1500)).toBe('25:00')
    expect(formatTime(1499)).toBe('24:59')
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(7200)).toBe('2:00:00')
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(-10)).toBe('00:00')
  })
})
