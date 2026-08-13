import type { DailyRecord, DailyRecords, PersistedState, TimerSettings } from '../types'
import { getLocalDateKey, isDateKey } from './localDate'
import { logger } from './logger'
import { clampVolume, DEFAULT_SOUND_ENABLED, DEFAULT_VOLUME } from './sound'
import { isTestProfile } from '../services/runtimeProfile'
import { isAccent, isAppearance } from '../domain/appearance'

export const STORAGE_KEY = 'pomodoro-state-v2'
export const LEGACY_STORAGE_KEY = 'pomodoro-state-v1'
export const TEST_STORAGE_KEY = `${STORAGE_KEY}-test`
export const TEST_LEGACY_STORAGE_KEY = `${LEGACY_STORAGE_KEY}-test`
export const DEFAULT_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreak: false,
  autoStartFocus: false,
}
export const DEFAULT_DESKTOP_NOTIFICATIONS = true
export const DEFAULT_CLOSE_TO_TRAY = true
export const DEFAULT_MINIMIZE_TO_TRAY = false
export const DEFAULT_GLOBAL_SHORTCUTS_ENABLED = true
export const DEFAULT_ALWAYS_ON_TOP = false
export const DEFAULT_REMEMBER_WINDOW_POSITION = true
export const DEFAULT_COMPACT_MODE = false
export const DEFAULT_APPEARANCE = 'dark' as const
export const DEFAULT_ACCENT = 'rose' as const

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface StorageFailure {
  operation: 'access' | 'read' | 'parse' | 'write'
  key: string
  cause: unknown
}

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: StorageFailure }

export const getTodayKey = getLocalDateKey
export { isDateKey }

const clampInteger = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

const normalizeSettings = (value: unknown): TimerSettings => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS }

  const candidate = value as Partial<TimerSettings>
  return {
    focusMinutes: clampInteger(candidate.focusMinutes, 1, 120, DEFAULT_SETTINGS.focusMinutes),
    breakMinutes: clampInteger(candidate.breakMinutes, 1, 60, DEFAULT_SETTINGS.breakMinutes),
    longBreakMinutes: clampInteger(
      candidate.longBreakMinutes,
      1,
      60,
      DEFAULT_SETTINGS.longBreakMinutes,
    ),
    longBreakInterval: clampInteger(
      candidate.longBreakInterval,
      2,
      8,
      DEFAULT_SETTINGS.longBreakInterval,
    ),
    autoStartBreak: typeof candidate.autoStartBreak === 'boolean'
      ? candidate.autoStartBreak
      : DEFAULT_SETTINGS.autoStartBreak,
    autoStartFocus: typeof candidate.autoStartFocus === 'boolean'
      ? candidate.autoStartFocus
      : DEFAULT_SETTINGS.autoStartFocus,
  }
}

const normalizeRecord = (date: string, value: unknown): DailyRecord | null => {
  if (!isDateKey(date) || !value || typeof value !== 'object') return null

  const candidate = value as Partial<DailyRecord>
  return {
    date,
    completedPomodoros: clampInteger(candidate.completedPomodoros, 0, 9999, 0),
    focusMinutes: clampInteger(candidate.focusMinutes, 0, 999999, 0),
  }
}

const normalizeDailyRecords = (value: unknown): DailyRecords => {
  if (!value || typeof value !== 'object') return {}

  const records: DailyRecords = {}
  for (const [date, record] of Object.entries(value)) {
    const normalized = normalizeRecord(date, record)
    if (normalized) records[date] = normalized
  }
  return records
}

export const createDefaultState = (): PersistedState => {
  const today = getTodayKey()
  return {
    version: 4,
    settings: { ...DEFAULT_SETTINGS },
    dailyRecords: {
      [today]: { date: today, completedPomodoros: 0, focusMinutes: 0 },
    },
    soundEnabled: DEFAULT_SOUND_ENABLED,
    volume: DEFAULT_VOLUME,
    desktopNotifications: DEFAULT_DESKTOP_NOTIFICATIONS,
    closeToTray: DEFAULT_CLOSE_TO_TRAY,
    minimizeToTray: DEFAULT_MINIMIZE_TO_TRAY,
    globalShortcutsEnabled: DEFAULT_GLOBAL_SHORTCUTS_ENABLED,
    alwaysOnTop: DEFAULT_ALWAYS_ON_TOP,
    rememberWindowPosition: DEFAULT_REMEMBER_WINDOW_POSITION,
    compactMode: DEFAULT_COMPACT_MODE,
    appearance: DEFAULT_APPEARANCE,
    accent: DEFAULT_ACCENT,
  }
}

export const normalizeState = (value: unknown): PersistedState => {
  const candidate = value && typeof value === 'object' ? (value as Partial<PersistedState>) : {}
  const records = normalizeDailyRecords(candidate.dailyRecords)
  const today = getTodayKey()
  if (!records[today]) {
    records[today] = { date: today, completedPomodoros: 0, focusMinutes: 0 }
  }

  return {
    version: 4,
    settings: normalizeSettings(candidate.settings),
    dailyRecords: records,
    soundEnabled: typeof candidate.soundEnabled === 'boolean'
      ? candidate.soundEnabled
      : DEFAULT_SOUND_ENABLED,
    volume: clampVolume(candidate.volume),
    desktopNotifications: typeof candidate.desktopNotifications === 'boolean'
      ? candidate.desktopNotifications
      : DEFAULT_DESKTOP_NOTIFICATIONS,
    closeToTray: typeof candidate.closeToTray === 'boolean'
      ? candidate.closeToTray
      : DEFAULT_CLOSE_TO_TRAY,
    minimizeToTray: typeof candidate.minimizeToTray === 'boolean'
      ? candidate.minimizeToTray
      : DEFAULT_MINIMIZE_TO_TRAY,
    globalShortcutsEnabled: typeof candidate.globalShortcutsEnabled === 'boolean'
      ? candidate.globalShortcutsEnabled
      : DEFAULT_GLOBAL_SHORTCUTS_ENABLED,
    alwaysOnTop: typeof candidate.alwaysOnTop === 'boolean'
      ? candidate.alwaysOnTop
      : DEFAULT_ALWAYS_ON_TOP,
    rememberWindowPosition: typeof candidate.rememberWindowPosition === 'boolean'
      ? candidate.rememberWindowPosition
      : DEFAULT_REMEMBER_WINDOW_POSITION,
    compactMode: typeof candidate.compactMode === 'boolean'
      ? candidate.compactMode
      : DEFAULT_COMPACT_MODE,
    appearance: isAppearance(candidate.appearance)
      ? candidate.appearance
      : DEFAULT_APPEARANCE,
    accent: isAccent(candidate.accent) ? candidate.accent : DEFAULT_ACCENT,
  }
}

export const migrateLegacyState = (value: unknown): PersistedState => {
  const candidate = value && typeof value === 'object' ? value as {
    settings?: unknown
    completedPomodoros?: unknown
    lastStatsDate?: unknown
  } : {}
  const state = createDefaultState()
  state.settings = normalizeSettings(candidate.settings)

  const legacyDate = isDateKey(candidate.lastStatsDate) ? candidate.lastStatsDate : getTodayKey()
  const completedPomodoros = clampInteger(candidate.completedPomodoros, 0, 9999, 0)
  if (completedPomodoros > 0) {
    state.dailyRecords[legacyDate] = {
      date: legacyDate,
      completedPomodoros,
      // v1 did not record minutes, so zero is safer than fabricating a duration.
      focusMinutes: 0,
    }
  }
  return state
}

export const getDailyRecord = (records: DailyRecords, date = getTodayKey()): DailyRecord => (
  records[date] ?? { date, completedPomodoros: 0, focusMinutes: 0 }
)

export const getStorageKeys = (testProfile = isTestProfile()): {
  current: string
  legacy: string
} => (testProfile
  ? { current: TEST_STORAGE_KEY, legacy: TEST_LEGACY_STORAGE_KEY }
  : { current: STORAGE_KEY, legacy: LEGACY_STORAGE_KEY })

const resolveStorage = (key: string, storage?: StorageLike): StorageResult<StorageLike> => {
  if (storage) return { ok: true, value: storage }
  try {
    return { ok: true, value: window.localStorage }
  } catch (cause: unknown) {
    return {
      ok: false,
      error: { operation: 'access', key, cause },
    }
  }
}

const readItem = (storage: StorageLike, key: string): StorageResult<string | null> => {
  try {
    return { ok: true, value: storage.getItem(key) }
  } catch (cause: unknown) {
    return { ok: false, error: { operation: 'read', key, cause } }
  }
}

const writeItem = (storage: StorageLike, key: string, value: string): StorageResult<void> => {
  try {
    storage.setItem(key, value)
    return { ok: true, value: undefined }
  } catch (cause: unknown) {
    return { ok: false, error: { operation: 'write', key, cause } }
  }
}

const logStorageFailure = (failure: StorageFailure): void => {
  logger.error(`Storage ${failure.operation} failed for ${failure.key}.`, failure.cause)
}

export const loadPersistedState = (
  storage?: StorageLike,
  testProfile = isTestProfile(),
): PersistedState => {
  const keys = getStorageKeys(testProfile)
  const resolvedStorage = resolveStorage(keys.current, storage)
  if (!resolvedStorage.ok) {
    logStorageFailure(resolvedStorage.error)
    return createDefaultState()
  }

  const currentResult = readItem(resolvedStorage.value, keys.current)
  if (!currentResult.ok) logStorageFailure(currentResult.error)
  const currentRaw = currentResult.ok ? currentResult.value : null

  if (currentRaw) {
    try {
      return normalizeState(JSON.parse(currentRaw))
    } catch (cause: unknown) {
      logStorageFailure({ operation: 'parse', key: keys.current, cause })
      // Try the legacy record before falling back to empty state.
    }
  }

  const legacyResult = readItem(resolvedStorage.value, keys.legacy)
  if (!legacyResult.ok) {
    logStorageFailure(legacyResult.error)
    return createDefaultState()
  }

  const legacyRaw = legacyResult.value
  if (legacyRaw) {
    try {
      const migrated = migrateLegacyState(JSON.parse(legacyRaw))
      const writeResult = writeItem(resolvedStorage.value, keys.current, JSON.stringify(migrated))
      if (!writeResult.ok) logStorageFailure(writeResult.error)
      return migrated
    } catch (cause: unknown) {
      logStorageFailure({ operation: 'parse', key: keys.legacy, cause })
    }
  }

  return createDefaultState()
}

export const savePersistedState = (
  state: PersistedState,
  storage?: StorageLike,
  testProfile = isTestProfile(),
): StorageResult<void> => {
  const key = getStorageKeys(testProfile).current
  const resolvedStorage = resolveStorage(key, storage)
  if (!resolvedStorage.ok) {
    logStorageFailure(resolvedStorage.error)
    return resolvedStorage
  }

  const result = writeItem(
    resolvedStorage.value,
    key,
    JSON.stringify(normalizeState(state)),
  )
  if (!result.ok) logStorageFailure(result.error)
  return result
}
