interface DailyStatsProps {
  completedPomodoros: number
}

export const DailyStats = ({ completedPomodoros }: DailyStatsProps) => (
  <section className="daily-stats" aria-label="今日完成统计">
    <div>
      <p className="eyebrow">今日完成</p>
      <p className="stats-value"><span aria-hidden="true">🍅</span> {completedPomodoros}</p>
    </div>
    <div className="stats-caption">
      <span className="stats-check"><span aria-hidden="true">✓</span></span>
      每个完整 Focus
    </div>
  </section>
)

