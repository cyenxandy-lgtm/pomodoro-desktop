import { addLocalDays, isDateKey } from './localDate'

const parseDateKey = (dateKey: string): Date | null => {
  if (!isDateKey(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const formatDuration = (seconds: number): string => {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder === 0 ? `${hours}小时` : `${hours}小时 ${remainder}分钟`
}

export const formatCalendarDate = (dateKey: string, todayKey?: string): string => {
  if (todayKey === dateKey) return '今天'
  if (todayKey && addLocalDays(todayKey, -1) === dateKey) return '昨天'
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  const currentYear = parseDateKey(todayKey ?? '')?.getFullYear() ?? new Date().getFullYear()
  return new Intl.DateTimeFormat('zh-CN', {
    year: date.getFullYear() === currentYear ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export const formatHeaderDate = (dateKey: string): string => {
  const date = parseDateKey(dateKey)
  if (!date) return dateKey
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

export const formatSessionTime = (timestamp: number): string => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date(timestamp))
