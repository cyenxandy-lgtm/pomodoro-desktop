import { useMemo, useState } from 'react'
import type { TimerSession } from '../domain/session'
import type { DailyFocusStatistics, StatisticsViewModel } from '../domain/statistics'
import { formatFocusDuration } from '../domain/statistics'
import { Icon } from './Icon'

interface StatisticsPageProps {
  data: StatisticsViewModel
  loading: boolean
  error: boolean
  onRetry: () => void
}

const formatDate = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

const formatDayLabel = (dateKey: string, isToday: boolean): string => {
  if (isToday) return '今天'
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'narrow' }).format(
    new Date(year, month - 1, day),
  )
}

const modeLabel = (session: TimerSession): string => {
  if (session.mode === 'focus') return 'Focus'
  return session.mode === 'longBreak' ? 'Long Break' : 'Short Break'
}

const statusLabel = (session: TimerSession): string => {
  if (session.status === 'completed') return '完成'
  return session.status === 'skipped' ? '跳过' : '中断'
}

const formatSessionTime = (timestamp: number): string => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date(timestamp))

const TrendChart = ({ records }: { records: DailyFocusStatistics[] }) => {
  const maximum = Math.max(...records.map((record) => record.focusSeconds), 0)
  if (maximum === 0) {
    return (
      <div className="trend-empty">
        <strong>还没有专注记录</strong>
        <span>完成一个番茄后，这里会出现你的专注趋势。</span>
      </div>
    )
  }

  const sparseLabels = records.length > 7
  return (
    <div className={`trend-chart ${sparseLabels ? 'is-thirty-days' : ''}`} aria-label={`${records.length} 天专注趋势`}>
      {records.map((record, index) => {
        const isToday = index === records.length - 1
        const showLabel = !sparseLabels || index % 5 === 0 || isToday
        const height = record.focusSeconds === 0 ? 2 : Math.max(8, record.focusSeconds / maximum * 100)
        return (
          <div
            className="trend-column"
            key={record.date}
            title={`${formatDate(record.date)}\n${record.completedPomodoros} 个番茄\n${formatFocusDuration(record.focusSeconds)}`}
          >
            <span className="trend-value">{record.completedPomodoros || ''}</span>
            <span className="trend-track">
              <span className="trend-bar" style={{ height: `${height}%` }} />
            </span>
            <span className="trend-label">{showLabel ? formatDayLabel(record.date, isToday) : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

const SessionList = ({ sessions, emptyText }: { sessions: TimerSession[]; emptyText: string }) => (
  sessions.length === 0 ? <p className="session-empty">{emptyText}</p> : (
    <div className="session-list">
      {sessions.map((session) => (
        <article className="session-item" key={session.id}>
          <time>{formatSessionTime(session.endedAt)}</time>
          <div className="session-main">
            <strong>{modeLabel(session)}</strong>
            <span>{formatFocusDuration(session.plannedDurationSeconds)}</span>
          </div>
          <span className={`session-status is-${session.status}`}>{statusLabel(session)}</span>
        </article>
      ))}
    </div>
  )
)

export const StatisticsPage = ({ data, loading, error, onRetry }: StatisticsPageProps) => {
  const [range, setRange] = useState<7 | 30>(7)
  const trend = range === 7 ? data.sevenDays : data.thirtyDays
  const trendSummary = useMemo(() => trend.reduce((result, record) => ({
    pomodoros: result.pomodoros + record.completedPomodoros,
    seconds: result.seconds + record.focusSeconds,
  }), { pomodoros: 0, seconds: 0 }), [trend])
  const olderSessions = data.recentSessions
    .filter((session) => session.date !== data.today.date)
    .slice(0, 20)

  if (error) {
    return (
      <section className="statistics-error" aria-label="统计加载失败">
        <Icon name="history" size={22} />
        <strong>暂时无法加载统计数据</strong>
        <span>Timer 仍可正常使用。</span>
        <button type="button" onClick={onRetry}>重试</button>
      </section>
    )
  }

  return (
    <section className={`statistics-panel ${loading ? 'is-loading' : ''}`} aria-label="番茄统计">
      <div className="statistics-heading">
        <div className="statistics-icon"><Icon name="history" size={19} /></div>
        <div>
          <p className="eyebrow">Statistics</p>
          <h2>专注统计</h2>
        </div>
        {loading && <span className="statistics-loading" role="status">更新中</span>}
      </div>

      <section className="today-statistics" aria-label="今天统计">
        <div>
          <p className="eyebrow">今天</p>
          <strong><span aria-hidden="true">🍅</span>{data.today.completedPomodoros}</strong>
        </div>
        <div className="today-duration">
          <span>专注时间</span>
          <strong>{formatFocusDuration(data.today.focusSeconds)}</strong>
        </div>
      </section>

      {data.summary.totalPomodoros === 0 && data.recentSessions.length === 0 && (
        <div className="statistics-empty">
          <span aria-hidden="true">🍅</span>
          <strong>还没有专注记录</strong>
          <p>完成第一个番茄后，这里会开始记录你的专注趋势。</p>
        </div>
      )}

      <section className="statistics-section" aria-label="专注趋势">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">趋势</p>
            <strong>过去 {range} 天</strong>
          </div>
          <div className="range-switch" aria-label="趋势范围">
            <button className={range === 7 ? 'active' : ''} type="button" onClick={() => setRange(7)}>7天</button>
            <button className={range === 30 ? 'active' : ''} type="button" onClick={() => setRange(30)}>30天</button>
          </div>
        </div>
        <div className="trend-summary">
          <span>{trendSummary.pomodoros} 个番茄</span>
          <span>{formatFocusDuration(trendSummary.seconds)}</span>
        </div>
        <TrendChart records={trend} />
      </section>

      <section className="statistics-section" aria-label="连续专注">
        <div className="section-title-row">
          <div><p className="eyebrow">连续专注</p><strong>保持节奏</strong></div>
        </div>
        <div className="streak-metrics">
          <div><span>当前连续</span><strong>{data.summary.currentStreak}<small>天</small></strong></div>
          <div><span>最长连续</span><strong>{data.summary.longestStreak}<small>天</small></strong></div>
        </div>
      </section>

      <section className="statistics-section" aria-label="全部时间统计">
        <div className="section-title-row">
          <div><p className="eyebrow">全部时间</p><strong>专注积累</strong></div>
        </div>
        <div className="all-time-grid">
          <div><span>总番茄</span><strong>{data.summary.totalPomodoros}</strong></div>
          <div><span>总专注</span><strong>{formatFocusDuration(data.summary.totalFocusSeconds)}</strong></div>
          <div><span>专注天数</span><strong>{data.summary.focusedDays} 天</strong></div>
          <div><span>最长连续</span><strong>{data.summary.longestStreak} 天</strong></div>
        </div>
      </section>

      <section className="statistics-section" aria-label="今日记录">
        <div className="section-title-row">
          <div><p className="eyebrow">Timeline</p><strong>今日记录</strong></div>
        </div>
        <SessionList sessions={data.todaySessions} emptyText="今天还没有真实 Session 记录" />
      </section>

      <section className="statistics-section" aria-label="每日历史">
        <div className="section-title-row">
          <div><p className="eyebrow">Daily</p><strong>每日历史</strong></div>
        </div>
        {data.dailyHistory.length === 0 ? <p className="session-empty">暂无每日汇总</p> : (
          <div className="daily-history-list">
            {data.dailyHistory.map((record) => (
              <article key={record.date}>
                <time>{record.date === data.today.date ? '今天' : formatDate(record.date)}</time>
                <strong><span aria-hidden="true">🍅</span>{record.completedPomodoros}</strong>
                <span>{formatFocusDuration(record.focusSeconds)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="statistics-section" aria-label="最近记录">
        <div className="section-title-row">
          <div><p className="eyebrow">Recent</p><strong>最近记录</strong></div>
        </div>
        <SessionList sessions={olderSessions} emptyText="暂无更早的真实 Session 记录" />
      </section>
    </section>
  )
}
