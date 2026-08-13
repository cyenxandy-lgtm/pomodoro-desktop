import { memo } from 'react'

interface DailyStatsProps { completedPomodoros: number }
const DailyStatsComponent = ({ completedPomodoros }: DailyStatsProps) => (
  <section className="daily-stats" aria-label="今日完成统计">
    <div><p className="eyebrow">今日完成</p><p className="stats-value"><span aria-hidden="true">🍅</span> {completedPomodoros}</p></div>
    <div className="stats-caption"><span className="stats-check" aria-hidden="true">✓</span>只统计完整专注</div>
  </section>
)

export const DailyStats = memo(DailyStatsComponent)
