export type {
  TimerCompletedEvent as TimerCompletion,
  TimerEvent,
  TimerMode,
  TimerService,
  TimerSettings,
  TimerSnapshot,
  TimerStatus,
} from './domain/timer'

import type { TimerSettings } from './domain/timer'
import type { Accent, Appearance } from './domain/appearance'

export type { Accent, Appearance } from './domain/appearance'

export interface DailyRecord {
  date: string
  completedPomodoros: number
  focusMinutes: number
}

export type DailyRecords = Record<string, DailyRecord>

export interface PersistedState {
  version: 4
  settings: TimerSettings
  /** Aggregate-only V1/V2 history. Never convert it into fabricated sessions. */
  dailyRecords: DailyRecords
  soundEnabled: boolean
  volume: number
  desktopNotifications: boolean
  closeToTray: boolean
  minimizeToTray: boolean
  globalShortcutsEnabled: boolean
  alwaysOnTop: boolean
  rememberWindowPosition: boolean
  compactMode: boolean
  appearance: Appearance
  accent: Accent
}
