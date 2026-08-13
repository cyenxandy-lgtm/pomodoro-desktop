import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatDuration } from './formatters'

describe('product formatters', () => {
  it('formats durations with one consistent Chinese convention', () => {
    expect(formatDuration(0)).toBe('0分钟')
    expect(formatDuration(5_400)).toBe('1小时 30分钟')
    expect(formatDuration(9_000)).toBe('2小时 30分钟')
  })

  it('formats relative and calendar dates consistently', () => {
    expect(formatCalendarDate('2026-08-13', '2026-08-13')).toBe('今天')
    expect(formatCalendarDate('2026-08-12', '2026-08-13')).toBe('昨天')
    expect(formatCalendarDate('2026-08-10', '2026-08-13')).toBe('8月10日')
    expect(formatCalendarDate('2025-12-31', '2026-08-13')).toBe('2025年12月31日')
  })
})
