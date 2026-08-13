import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DailyStats } from './components/DailyStats'
import { CompactTimer } from './components/CompactTimer'
import { History } from './components/History'
import { Icon } from './components/Icon'
import { ModeSelector } from './components/ModeSelector'
import { SettingsPanel } from './components/SettingsPanel'
import { TimerControls } from './components/TimerControls'
import { usePersistedState } from './hooks/usePersistedState'
import { useSound } from './hooks/useSound'
import { useSessionDailyRecords } from './hooks/useSessionDailyRecords'
import { useTimer } from './hooks/useTimer'
import { useTodayKey } from './hooks/useTodayKey'
import type { TimerCompletion, TimerMode, TimerSettings } from './types'
import { TimerCompletionCoordinator } from './services/TimerCompletionCoordinator'
import { createRuntimeServices } from './services/runtimeServices'
import { mergeDailyRecords, recordFocusCompletion } from './utils/dailyStats'
import { getLocalDateKey } from './utils/localDate'
import { getDailyRecord } from './utils/storage'
import { formatTime } from './utils/timer'
import { logger } from './utils/logger'
import './App.css'

type AppView = 'timer' | 'history' | 'settings'

const formatDate = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(year, month - 1, day))
}

function App() {
  const { persistedState, setPersistedState, hasStorageWarning } = usePersistedState()
  const runtimeRef = useRef<ReturnType<typeof createRuntimeServices> | null>(null)
  if (runtimeRef.current === null) {
    runtimeRef.current = createRuntimeServices(
      persistedState.settings,
      persistedState.soundEnabled,
      persistedState.volume,
      persistedState.desktopNotifications,
    )
  }
  const runtime = runtimeRef.current
  const [view, setView] = useState<AppView>('timer')
  const [shortcutUnavailable, setShortcutUnavailable] = useState<string[]>([])
  const todayKey = useTodayKey()
  const { dailyRecords: sessionDailyRecords, refresh: refreshSessionDailyRecords } = (
    useSessionDailyRecords(runtime.sessionRepository)
  )
  const dailyRecords = useMemo(() => mergeDailyRecords(
    persistedState.dailyRecords,
    sessionDailyRecords,
  ), [persistedState.dailyRecords, sessionDailyRecords])
  const todayRecord = getDailyRecord(dailyRecords, todayKey)
  const completionCoordinatorRef = useRef(new TimerCompletionCoordinator())
  const { playCompletionSound } = useSound({
    enabled: persistedState.soundEnabled,
    volume: persistedState.volume,
  })

  const handleTimerComplete = useCallback((completion: TimerCompletion) => {
    if (runtime.isNative) {
      void refreshSessionDailyRecords()
      return
    }
    completionCoordinatorRef.current.handle(completion, {
      playSound: playCompletionSound,
      recordFocus: (plannedDurationSeconds) => {
        setPersistedState((current) => ({
          ...current,
          dailyRecords: recordFocusCompletion(
            current.dailyRecords,
            getLocalDateKey(completion.completedAt),
            plannedDurationSeconds / 60,
          ),
        }))
      },
    })
  }, [playCompletionSound, refreshSessionDailyRecords, runtime.isNative, setPersistedState])

  const timer = useTimer({
    settings: persistedState.settings,
    onComplete: handleTimerComplete,
    service: runtime.timerService,
  })

  useEffect(() => {
    void runtime
      .configureSound(persistedState.soundEnabled, persistedState.volume)
      .catch((error: unknown) => {
        logger.error('Failed to configure native completion sound.', error)
      })
  }, [persistedState.soundEnabled, persistedState.volume, runtime])

  useEffect(() => {
    void runtime
      .configureNotifications(persistedState.desktopNotifications)
      .catch((error: unknown) => {
        logger.error('Failed to configure desktop notifications.', error)
      })
  }, [persistedState.desktopNotifications, runtime])

  useEffect(() => {
    void runtime
      .configureLifecycle(persistedState.closeToTray, persistedState.minimizeToTray)
      .catch((error: unknown) => {
        logger.error('Failed to configure desktop lifecycle.', error)
      })
  }, [persistedState.closeToTray, persistedState.minimizeToTray, runtime])

  useEffect(() => {
    void runtime
      .configureProductivity({
        globalShortcutsEnabled: persistedState.globalShortcutsEnabled,
        alwaysOnTop: persistedState.alwaysOnTop,
        rememberWindowPosition: persistedState.rememberWindowPosition,
        compactMode: persistedState.compactMode,
      })
      .then((status) => setShortcutUnavailable(status.unavailable))
      .catch((error: unknown) => {
        logger.error('Failed to configure desktop productivity settings.', error)
      })
  }, [
    persistedState.alwaysOnTop,
    persistedState.compactMode,
    persistedState.globalShortcutsEnabled,
    persistedState.rememberWindowPosition,
    runtime,
  ])

  const updateSettings = useCallback((settings: Partial<TimerSettings>) => {
    setPersistedState((current) => ({
      ...current,
      settings: { ...current.settings, ...settings },
    }))
  }, [setPersistedState])

  const updateSoundEnabled = useCallback((soundEnabled: boolean) => {
    setPersistedState((current) => ({ ...current, soundEnabled }))
  }, [setPersistedState])

  const updateVolume = useCallback((volume: number) => {
    setPersistedState((current) => ({ ...current, volume }))
  }, [setPersistedState])

  const updateDesktopNotifications = useCallback((desktopNotifications: boolean) => {
    setPersistedState((current) => ({ ...current, desktopNotifications }))
  }, [setPersistedState])

  const updateCloseToTray = useCallback((closeToTray: boolean) => {
    setPersistedState((current) => ({ ...current, closeToTray }))
  }, [setPersistedState])

  const updateMinimizeToTray = useCallback((minimizeToTray: boolean) => {
    setPersistedState((current) => ({ ...current, minimizeToTray }))
  }, [setPersistedState])

  const updateGlobalShortcutsEnabled = useCallback((globalShortcutsEnabled: boolean) => {
    setPersistedState((current) => ({ ...current, globalShortcutsEnabled }))
  }, [setPersistedState])

  const updateAlwaysOnTop = useCallback((alwaysOnTop: boolean) => {
    setPersistedState((current) => ({ ...current, alwaysOnTop }))
  }, [setPersistedState])

  const updateRememberWindowPosition = useCallback((rememberWindowPosition: boolean) => {
    setPersistedState((current) => ({ ...current, rememberWindowPosition }))
  }, [setPersistedState])

  const updateCompactMode = useCallback((compactMode: boolean) => {
    setPersistedState((current) => ({ ...current, compactMode }))
  }, [setPersistedState])

  const handleModeSelect = (mode: TimerMode) => {
    timer.selectMode(mode)
    setView('timer')
  }

  const statusLabel = timer.status === 'running' ? '进行中' : timer.status === 'paused' ? '已暂停' : '准备开始'
  const modeLabel = timer.mode === 'focus'
    ? 'FOCUS'
    : timer.mode === 'longBreak' ? 'LONG BREAK' : 'SHORT BREAK'

  return (
    <div className={`app-shell ${timer.mode === 'focus' ? 'is-focus' : 'is-break'} ${persistedState.compactMode ? 'is-compact' : ''}`}>
      {persistedState.compactMode ? (
        <CompactTimer
          mode={timer.mode}
          status={timer.status}
          remainingSeconds={timer.remainingSeconds}
          onStart={timer.start}
          onPause={timer.pause}
          onResume={timer.resume}
          onReset={timer.reset}
          onSkip={timer.skip}
          onExpand={() => updateCompactMode(false)}
        />
      ) : (
        <>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🍅</span>
          <span>Pomodoro</span>
        </div>
        <div className="header-actions">
          <span className="date-label">{formatDate(todayKey)}</span>
          <button className="compact-button" type="button" onClick={() => updateCompactMode(true)} aria-label="进入紧凑模式">
            <Icon name="compact" size={15} />
            Compact
          </button>
        </div>
      </header>

      {hasStorageWarning && (
        <div className="storage-warning" role="status" aria-live="polite">
          数据暂时无法保存
        </div>
      )}

      {view === 'timer' ? (
        <main className="timer-page">
          <div className="timer-heading">
            <span className="mode-label"><span className="live-dot" />{modeLabel}</span>
            <span className="status-label">{statusLabel}</span>
          </div>

          <div className="timer-stage">
            <div className="timer-ring" aria-hidden="true">
              <div className="ring-orbit" />
            </div>
            <time className="timer-display" dateTime={`PT${timer.remainingSeconds}S`}>
              {formatTime(timer.remainingSeconds)}
            </time>
            <p className="timer-message">
              {timer.mode === 'focus'
                ? `专注当下 · 本组 ${timer.completedFocusesInCycle}/${persistedState.settings.longBreakInterval}`
                : timer.mode === 'longBreak' ? '放松一下，准备新一组专注' : '稍作休息，准备下一轮'}
            </p>
          </div>

          <TimerControls
            status={timer.status}
            onStart={timer.start}
            onPause={timer.pause}
            onResume={timer.resume}
            onReset={timer.reset}
            onSkip={timer.skip}
          />

          <DailyStats completedPomodoros={todayRecord.completedPomodoros} />
        </main>
      ) : view === 'history' ? (
        <main className="history-page">
          <History dailyRecords={dailyRecords} today={todayKey} />
        </main>
      ) : (
        <main className="settings-page">
          <SettingsPanel
            settings={persistedState.settings}
            soundEnabled={persistedState.soundEnabled}
            volume={persistedState.volume}
            desktopNotifications={persistedState.desktopNotifications}
            closeToTray={persistedState.closeToTray}
            minimizeToTray={persistedState.minimizeToTray}
            globalShortcutsEnabled={persistedState.globalShortcutsEnabled}
            alwaysOnTop={persistedState.alwaysOnTop}
            rememberWindowPosition={persistedState.rememberWindowPosition}
            shortcutUnavailable={shortcutUnavailable}
            onChange={updateSettings}
            onSoundEnabledChange={updateSoundEnabled}
            onVolumeChange={updateVolume}
            onDesktopNotificationsChange={updateDesktopNotifications}
            onCloseToTrayChange={updateCloseToTray}
            onMinimizeToTrayChange={updateMinimizeToTray}
            onGlobalShortcutsEnabledChange={updateGlobalShortcutsEnabled}
            onAlwaysOnTopChange={updateAlwaysOnTop}
            onRememberWindowPositionChange={updateRememberWindowPosition}
            onTestSound={playCompletionSound}
          />
        </main>
      )}

      <nav className="bottom-nav" aria-label="主导航">
        <ModeSelector mode={timer.mode} status={timer.status} onSelect={handleModeSelect} />
        <span className="nav-divider" />
        <button
          className={view === 'history' ? 'history-tab active' : 'history-tab'}
          type="button"
          onClick={() => setView('history')}
        >
          <Icon name="history" size={15} />
          记录
        </button>
        <button
          className={view === 'settings' ? 'settings-tab active' : 'settings-tab'}
          type="button"
          onClick={() => setView(view === 'settings' ? 'timer' : 'settings')}
        >
          <Icon name="settings" size={15} />
          设置
        </button>
      </nav>
        </>
      )}
    </div>
  )
}

export default App
