import type { DailyRecords } from '../types'
import { getRecentRecords } from '../utils/dailyStats'
import { Icon } from './Icon'

interface HistoryProps {
  dailyRecords: DailyRecords
  today: string
}

const formatDate = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

export const History = ({ dailyRecords, today }: HistoryProps) => {
  const records = getRecentRecords(dailyRecords, today)

  return (
    <section className="history-panel" aria-label="历史记录">
      <div className="history-heading">
        <div className="history-icon"><Icon name="history" size={19} /></div>
        <div>
          <p className="eyebrow">最近 30 天</p>
          <h2>历史记录</h2>
        </div>
      </div>
      <p className="history-description">每一次完整 Focus，都会留下当天的专注足迹。</p>

      {records.length === 0 ? (
        <div className="history-empty">
          <span className="empty-tomato" aria-hidden="true">🍅</span>
          <strong>还没有完成记录</strong>
          <span>完成一个 Focus 后，它会出现在这里。</span>
        </div>
      ) : (
        <div className="history-list">
          {records.map((record) => {
            const isToday = record.date === today
            return (
              <article className="history-item" key={record.date}>
                <div className="history-date">
                  <strong>{isToday ? '今天' : formatDate(record.date)}</strong>
                  {isToday && <span>Today</span>}
                </div>
                <div className="history-metrics">
                  <div className="history-count"><span aria-hidden="true">🍅</span>{record.completedPomodoros}</div>
                  <div className="history-minutes">{record.focusMinutes} 分钟</div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
