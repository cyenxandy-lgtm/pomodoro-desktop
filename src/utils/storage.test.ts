import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageLike } from './storage'
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  loadPersistedState,
  migrateLegacyState,
  savePersistedState,
} from './storage'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

afterEach(() => vi.restoreAllMocks())

describe('storage', () => {
  it('reads and writes normalized V2 state', () => {
    const storage = new MemoryStorage()
    const state = loadPersistedState(storage)
    state.settings.focusMinutes = 45

    expect(savePersistedState(state, storage)).toEqual({ ok: true, value: undefined })
    expect(loadPersistedState(storage).settings.focusMinutes).toBe(45)
  })

  it('falls back safely when V2 JSON is corrupted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, '{broken')

    expect(loadPersistedState(storage).settings).toEqual({
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartBreak: false,
      autoStartFocus: false,
    })
  })

  it('clamps out-of-range fields from persisted data', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, JSON.stringify({
      settings: { focusMinutes: 999, breakMinutes: -4 },
      dailyRecords: {
        '2026-08-10': { completedPomodoros: -10, focusMinutes: 99_999_999 },
      },
      soundEnabled: 'invalid',
      volume: 7,
    }))

    const state = loadPersistedState(storage)
    expect(state.settings).toEqual({
      focusMinutes: 120,
      breakMinutes: 1,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartBreak: false,
      autoStartFocus: false,
    })
    expect(state.dailyRecords['2026-08-10']).toMatchObject({
      completedPomodoros: 0,
      focusMinutes: 999_999,
    })
    expect(state.volume).toBe(1)
  })

  it('keeps the legacy completed count without fabricating focus minutes or sessions', () => {
    const migrated = migrateLegacyState({
      settings: { focusMinutes: 50, breakMinutes: 10 },
      completedPomodoros: 3,
      lastStatsDate: '2026-08-09',
    })

    expect(migrated.settings).toEqual({
      focusMinutes: 50,
      breakMinutes: 10,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartBreak: false,
      autoStartFocus: false,
    })
    expect(migrated.dailyRecords['2026-08-09']).toEqual({
      date: '2026-08-09',
      completedPomodoros: 3,
      focusMinutes: 0,
    })
    expect(Object.hasOwn(migrated, 'sessions')).toBe(false)
    expect(migrated.soundEnabled).toBe(true)
    expect(migrated.volume).toBe(0.7)
    expect(migrated.desktopNotifications).toBe(true)
    expect(migrated.closeToTray).toBe(true)
    expect(migrated.minimizeToTray).toBe(false)
    expect(migrated.globalShortcutsEnabled).toBe(true)
    expect(migrated.alwaysOnTop).toBe(false)
    expect(migrated.rememberWindowPosition).toBe(true)
    expect(migrated.compactMode).toBe(false)
  })

  it('adds Phase 3B defaults without overwriting Phase 3A preferences', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, JSON.stringify({
      version: 2,
      settings: { focusMinutes: 45, breakMinutes: 10 },
      desktopNotifications: false,
      closeToTray: false,
      minimizeToTray: true,
    }))

    const migrated = loadPersistedState(storage)

    expect(migrated).toMatchObject({
      version: 3,
      desktopNotifications: false,
      closeToTray: false,
      minimizeToTray: true,
      globalShortcutsEnabled: true,
      alwaysOnTop: false,
      rememberWindowPosition: true,
      compactMode: false,
    })
    expect(migrated.settings).toMatchObject({ focusMinutes: 45, breakMinutes: 10 })
  })

  it('migrates V1 into V2 without deleting the legacy source', () => {
    const storage = new MemoryStorage()
    storage.values.set(LEGACY_STORAGE_KEY, JSON.stringify({
      completedPomodoros: 2,
      lastStatsDate: '2026-08-09',
    }))

    const state = loadPersistedState(storage)

    expect(state.dailyRecords['2026-08-09'].completedPomodoros).toBe(2)
    expect(storage.values.has(STORAGE_KEY)).toBe(true)
    expect(storage.values.has(LEGACY_STORAGE_KEY)).toBe(true)
  })

  it('returns a typed failure when writes fail and keeps the timer unblocked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('quota exceeded')
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => { throw error },
    }

    const result = savePersistedState(loadPersistedState(new MemoryStorage()), storage)

    expect(result).toEqual({
      ok: false,
      error: { operation: 'write', key: STORAGE_KEY, cause: error },
    })
  })
})
