// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimerSession } from '../domain/session'
import type { StatisticsViewModel } from '../domain/statistics'
import { StatisticsPage } from './StatisticsPage'

const session = (
  id: string,
  mode: TimerSession['mode'],
  status: TimerSession['status'],
  endedAt: number,
): TimerSession => ({
  id,
  completionEventId: status === 'completed' ? `completion-${id}` : null,
  mode,
  startedAt: endedAt - 60_000,
  endedAt,
  plannedDurationSeconds: mode === 'focus' ? 1_500 : 300,
  actualDurationSeconds: 60,
  status,
  date: '2026-08-10',
})

const days = (count: number) => Array.from({ length: count }, (_, index) => ({
  date: `2026-08-${String(index + 1).padStart(2, '0')}`,
  completedPomodoros: index === count - 1 ? 2 : 0,
  focusSeconds: index === count - 1 ? 3_000 : 0,
}))

const data: StatisticsViewModel = {
  today: { date: '2026-08-10', completedPomodoros: 2, focusSeconds: 3_000 },
  sevenDays: days(7),
  thirtyDays: days(30),
  dailyHistory: [{ date: '2026-08-10', completedPomodoros: 2, focusSeconds: 3_000 }],
  summary: {
    totalPomodoros: 8,
    totalFocusSeconds: 12_000,
    focusedDays: 4,
    currentStreak: 2,
    longestStreak: 3,
  },
  todaySessions: [
    session('focus', 'focus', 'completed', 30_000),
    session('short', 'shortBreak', 'skipped', 20_000),
    session('long', 'longBreak', 'cancelled', 10_000),
  ],
  recentSessions: [],
}

afterEach(cleanup)

describe('StatisticsPage', () => {
  it('renders core metrics and switches one chart between seven and thirty days', () => {
    render(<StatisticsPage data={data} loading={false} error={false} onRetry={vi.fn()} />)

    expect(screen.getByRole('region', { name: '今天统计' }).textContent).toContain('2')
    expect(screen.getByLabelText('最近 7 天共完成 2 个番茄，专注 50分钟')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '30 天' }))
    expect(screen.getByLabelText('最近 30 天共完成 2 个番茄，专注 50分钟')).toBeTruthy()
    expect(screen.getByRole('region', { name: '全部时间统计' }).textContent).toContain('3小时 20分钟')
  })

  it('labels Focus, breaks and every persisted session status', () => {
    render(<StatisticsPage data={data} loading={false} error={false} onRetry={vi.fn()} />)

    const timeline = screen.getByRole('region', { name: '今日记录' })
    expect(timeline.textContent).toContain('专注')
    expect(timeline.textContent).toContain('短休息')
    expect(timeline.textContent).toContain('长休息')
    expect(timeline.textContent).toContain('完成')
    expect(timeline.textContent).toContain('跳过')
    expect(timeline.textContent).toContain('中断')
  })

  it('offers a retry without crashing the Timer when the query fails', () => {
    const onRetry = vi.fn()
    render(<StatisticsPage data={data} loading={false} error onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
