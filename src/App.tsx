import { useCallback, useEffect, useRef, useState } from 'react'
import { CompactTimer } from './components/CompactTimer'
import { DailyStats } from './components/DailyStats'
import { Icon } from './components/Icon'
import { ModeSelector } from './components/ModeSelector'
import { SettingsPanel } from './components/SettingsPanel'
import { StatisticsPage } from './components/StatisticsPage'
import { TimerControls } from './components/TimerControls'
import { useAppVersion } from './hooks/useAppVersion'
import { usePersistedState } from './hooks/usePersistedState'
import { useSound } from './hooks/useSound'
import { useStatistics } from './hooks/useStatistics'
import { useTheme } from './hooks/useTheme'
import { useTimer } from './hooks/useTimer'
import { useTodayKey } from './hooks/useTodayKey'
import { TimerCompletionCoordinator } from './services/TimerCompletionCoordinator'
import { createRuntimeServices } from './services/runtimeServices'
import type { Accent, Appearance, TimerCompletion, TimerMode, TimerSettings } from './types'
import { recordFocusCompletion } from './utils/dailyStats'
import { formatHeaderDate } from './utils/formatters'
import { getLocalDateKey } from './utils/localDate'
import { logger } from './utils/logger'
import { formatTime } from './utils/timer'
import './App.css'

type AppView = 'timer' | 'statistics' | 'settings'

const modeLabel = (mode: TimerMode): string => (
  mode === 'focus' ? '专注' : mode === 'longBreak' ? '长休息' : '短休息'
)

function App() {
  const {
    persistedState,
    setPersistedState,
    hasStorageWarning,
    retryPersistence,
  } = usePersistedState()
  useTheme(persistedState.appearance, persistedState.accent)
  const version = useAppVersion()
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
  const [notificationPermissionDenied, setNotificationPermissionDenied] = useState(false)
  const [completionNotice, setCompletionNotice] = useState<string | null>(null)
  const [desktopNotice, setDesktopNotice] = useState<string | null>(null)
  const todayKey = useTodayKey()
  const statistics = useStatistics(runtime.statisticsService, persistedState.dailyRecords, todayKey)
  const refreshStatistics = statistics.refresh
  const todayRecord = statistics.data.today
  const completionCoordinatorRef = useRef(new TimerCompletionCoordinator())
  const { playCompletionSound } = useSound({
    enabled: persistedState.soundEnabled,
    volume: persistedState.volume,
  })

  const handleTimerComplete = useCallback((completion: TimerCompletion) => {
    setCompletionNotice(
      completion.mode === 'focus' ? '专注完成，休息一下吧' : '休息结束，准备继续专注',
    )
    if (runtime.isNative) {
      void refreshStatistics()
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
  }, [playCompletionSound, refreshStatistics, runtime.isNative, setPersistedState])

  const timer = useTimer({
    settings: persistedState.settings,
    onComplete: handleTimerComplete,
    service: runtime.timerService,
  })

  useEffect(() => {
    if (!completionNotice) return
    const timeout = window.setTimeout(() => setCompletionNotice(null), 2_200)
    return () => window.clearTimeout(timeout)
  }, [completionNotice])

  useEffect(() => {
    void runtime.configureSound(persistedState.soundEnabled, persistedState.volume)
      .catch((error: unknown) => logger.error('Failed to configure native completion sound.', error))
  }, [persistedState.soundEnabled, persistedState.volume, runtime])

  useEffect(() => {
    void runtime.configureNotifications(persistedState.desktopNotifications)
      .then((granted) => setNotificationPermissionDenied(
        persistedState.desktopNotifications && !granted,
      ))
      .catch((error: unknown) => logger.error('Failed to configure desktop notifications.', error))
  }, [persistedState.desktopNotifications, runtime])

  useEffect(() => {
    void runtime.configureLifecycle(persistedState.closeToTray, persistedState.minimizeToTray)
      .catch((error: unknown) => logger.error('Failed to configure desktop lifecycle.', error))
  }, [persistedState.closeToTray, persistedState.minimizeToTray, runtime])

  useEffect(() => {
    void runtime.configureProductivity({
      globalShortcutsEnabled: persistedState.globalShortcutsEnabled,
      alwaysOnTop: persistedState.alwaysOnTop,
      rememberWindowPosition: persistedState.rememberWindowPosition,
      compactMode: persistedState.compactMode,
    }).then((status) => {
      setShortcutUnavailable(status.unavailable)
      setDesktopNotice(null)
    }).catch((error: unknown) => {
      setDesktopNotice('部分桌面设置暂时无法应用，计时器仍可正常使用。')
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
    setPersistedState((current) => ({ ...current, settings: { ...current.settings, ...settings } }))
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
  const updateAppearance = useCallback((appearance: Appearance) => {
    setPersistedState((current) => ({ ...current, appearance }))
  }, [setPersistedState])
  const updateAccent = useCallback((accent: Accent) => {
    setPersistedState((current) => ({ ...current, accent }))
  }, [setPersistedState])
  const selectTimerMode = timer.selectMode
  const handleModeSelect = useCallback((mode: TimerMode) => {
    selectTimerMode(mode)
    setView('timer')
  }, [selectTimerMode])
  const openStatistics = useCallback(() => {
    setView('statistics')
    void refreshStatistics()
  }, [refreshStatistics])
  const toggleSettings = useCallback(() => {
    setView((current) => current === 'settings' ? 'timer' : 'settings')
  }, [])
  const handleStatisticsRetry = useCallback(() => void refreshStatistics(), [refreshStatistics])
  const enterCompactMode = useCallback(() => updateCompactMode(true), [updateCompactMode])
  const exitCompactMode = useCallback(() => updateCompactMode(false), [updateCompactMode])

  const statusLabel = timer.status === 'running' ? '进行中' : timer.status === 'paused' ? '已暂停' : '准备开始'
  const accessibleStatus = completionNotice ?? `${modeLabel(timer.mode)}，${statusLabel}`

  return (
    <div className={`app-shell mode-${timer.mode} ${persistedState.compactMode ? 'is-compact' : ''} ${completionNotice ? 'has-completion-feedback' : ''}`}>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{accessibleStatus}</div>
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
          onExpand={exitCompactMode}
        />
      ) : (
        <>
          <header className="app-header">
            <div className="brand"><span className="brand-mark" aria-hidden="true">🍅</span><span>Pomodoro</span></div>
            <div className="header-actions">
              <span className="date-label">{formatHeaderDate(todayKey)}</span>
              <button className="compact-button button-ghost" type="button" onClick={enterCompactMode} aria-label="进入紧凑模式">
                <Icon name="compact" size={15} />紧凑
              </button>
            </div>
          </header>

          {(hasStorageWarning || desktopNotice) && (
            <div className="notice-stack">
              {hasStorageWarning && <div className="inline-notice is-warning" role="status"><span>部分设置暂时无法保存。</span><button type="button" onClick={retryPersistence}>重试</button></div>}
              {desktopNotice && <div className="inline-notice is-warning" role="status"><span>{desktopNotice}</span></div>}
            </div>
          )}

          {view === 'timer' ? (
            <main className="timer-page" aria-label="番茄计时器">
              <div className="timer-heading">
                <span className="mode-label"><span className="live-dot" />{modeLabel(timer.mode)}</span>
                <span className="status-label">{statusLabel}</span>
              </div>

              {!timer.isReady ? (
                <div className="timer-loading" role="status"><span className="loading-indicator" aria-hidden="true" />正在恢复计时状态…</div>
              ) : (
                <>
                  <div className="timer-stage">
                    <div className="timer-ring" aria-hidden="true"><div className="ring-orbit" /></div>
                    <time className="timer-display" dateTime={`PT${timer.remainingSeconds}S`} aria-label={`剩余 ${formatTime(timer.remainingSeconds)}`}>
                      {formatTime(timer.remainingSeconds)}
                    </time>
                    <p className="timer-message">
                      {completionNotice ?? (timer.mode === 'focus'
                        ? `专注当下 · 本组 ${timer.completedFocusesInCycle}/${persistedState.settings.longBreakInterval}`
                        : timer.mode === 'longBreak' ? '放松一下，准备新一组专注' : '稍作休息，准备下一轮')}
                    </p>
                  </div>
                  <TimerControls status={timer.status} onStart={timer.start} onPause={timer.pause} onResume={timer.resume} onReset={timer.reset} onSkip={timer.skip} />
                  <DailyStats completedPomodoros={todayRecord.completedPomodoros} />
                </>
              )}
            </main>
          ) : view === 'statistics' ? (
            <main className="statistics-page">
              <StatisticsPage data={statistics.data} loading={statistics.loading} error={statistics.error} onRetry={handleStatisticsRetry} />
            </main>
          ) : (
            <main className="settings-page">
              <SettingsPanel
                settings={persistedState.settings}
                soundEnabled={persistedState.soundEnabled}
                volume={persistedState.volume}
                desktopNotifications={persistedState.desktopNotifications}
                notificationPermissionDenied={notificationPermissionDenied}
                closeToTray={persistedState.closeToTray}
                minimizeToTray={persistedState.minimizeToTray}
                globalShortcutsEnabled={persistedState.globalShortcutsEnabled}
                alwaysOnTop={persistedState.alwaysOnTop}
                rememberWindowPosition={persistedState.rememberWindowPosition}
                shortcutUnavailable={shortcutUnavailable}
                appearance={persistedState.appearance}
                accent={persistedState.accent}
                version={version}
                onChange={updateSettings}
                onSoundEnabledChange={updateSoundEnabled}
                onVolumeChange={updateVolume}
                onDesktopNotificationsChange={updateDesktopNotifications}
                onCloseToTrayChange={updateCloseToTray}
                onMinimizeToTrayChange={updateMinimizeToTray}
                onGlobalShortcutsEnabledChange={updateGlobalShortcutsEnabled}
                onAlwaysOnTopChange={updateAlwaysOnTop}
                onRememberWindowPositionChange={updateRememberWindowPosition}
                onAppearanceChange={updateAppearance}
                onAccentChange={updateAccent}
                onTestSound={playCompletionSound}
              />
            </main>
          )}

          <nav className="bottom-nav" aria-label="主导航">
            <ModeSelector mode={timer.mode} status={timer.status} onSelect={handleModeSelect} />
            <span className="nav-divider" />
            <button className={view === 'statistics' ? 'history-tab active' : 'history-tab'} type="button" aria-pressed={view === 'statistics'} onClick={openStatistics}>
              <Icon name="history" size={15} />统计
            </button>
            <button className={view === 'settings' ? 'settings-tab active' : 'settings-tab'} type="button" aria-pressed={view === 'settings'} onClick={toggleSettings}>
              <Icon name="settings" size={15} />{view === 'settings' ? '返回' : '设置'}
            </button>
          </nav>
        </>
      )}
    </div>
  )
}

export default App
