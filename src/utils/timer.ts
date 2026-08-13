import type { TimerMode, TimerSettings } from '../types'

export const getDurationSeconds = (mode: TimerMode, settings: TimerSettings): number => (
  (
    mode === 'focus'
      ? settings.focusMinutes
      : mode === 'longBreak'
        ? settings.longBreakMinutes
        : settings.breakMinutes
  ) * 60
)

export const formatTime = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0')
  const seconds = (safeSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}
