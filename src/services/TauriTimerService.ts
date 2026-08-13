import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  TimerEvent,
  TimerEventListener,
  TimerMode,
  TimerService,
  TimerSettings,
  TimerSnapshot,
} from '../domain/timer'
import { getDurationSeconds } from '../utils/timer'
import { logger } from '../utils/logger'

interface TauriEvent<T> {
  payload: T
}

export interface TauriBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
  listen<T>(event: string, listener: (event: TauriEvent<T>) => void): Promise<() => void>
}

interface TauriTimerServiceOptions {
  settings: TimerSettings
  soundEnabled: boolean
  volume: number
  desktopNotifications: boolean
  bridge?: TauriBridge
}

const defaultBridge: TauriBridge = {
  invoke: (command, args) => invoke(command, args),
  listen: (event, listener) => listen(event, listener),
}

const idleSnapshot = (settings: TimerSettings): TimerSnapshot => ({
  mode: 'focus',
  status: 'idle',
  remainingSeconds: getDurationSeconds('focus', settings),
  durationSeconds: getDurationSeconds('focus', settings),
  startedAt: null,
  targetEndTime: null,
  sessionId: null,
  completedFocusesInCycle: 0,
})

/** Thin projection adapter. All timing and transition decisions remain in Rust. */
export class TauriTimerService implements TimerService {
  private settings: TimerSettings
  private soundEnabled: boolean
  private volume: number
  private desktopNotifications: boolean
  private snapshot: TimerSnapshot
  private readonly bridge: TauriBridge
  private readonly listeners = new Set<TimerEventListener>()
  private readyPromise: Promise<void> | null = null
  private unlisten: (() => void) | null = null

  constructor(options: TauriTimerServiceOptions) {
    this.settings = { ...options.settings }
    this.soundEnabled = options.soundEnabled
    this.volume = options.volume
    this.desktopNotifications = options.desktopNotifications
    this.snapshot = idleSnapshot(options.settings)
    this.bridge = options.bridge ?? defaultBridge
  }

  getSnapshot = (): TimerSnapshot => this.snapshot

  subscribe = (listener: TimerEventListener): (() => void) => {
    this.listeners.add(listener)
    void this.ensureReady().catch((error: unknown) => {
      logger.error('Failed to initialize native timer.', error)
    })
    return () => this.listeners.delete(listener)
  }

  configure = async (settings: TimerSettings): Promise<void> => {
    this.settings = { ...settings }
    await this.ensureReady()
    const snapshot = await this.bridge.invoke<TimerSnapshot>('timer_configure', { settings })
    this.applySnapshotIfChanged(snapshot)
  }

  configureSound = async (enabled: boolean, volume: number): Promise<void> => {
    this.soundEnabled = enabled
    this.volume = volume
    await this.ensureReady()
    await this.bridge.invoke<void>('timer_configure_sound', { enabled, volume })
  }

  start = async (): Promise<void> => {
    await this.invokeCommand('timer_start')
  }

  pause = async (): Promise<void> => {
    await this.invokeCommand('timer_pause')
  }

  resume = async (): Promise<void> => {
    await this.invokeCommand('timer_resume')
  }

  reset = async (): Promise<void> => {
    await this.invokeCommand('timer_reset')
  }

  skip = async (): Promise<void> => {
    await this.invokeCommand('timer_skip')
  }

  configureNotifications = async (enabled: boolean): Promise<void> => {
    this.desktopNotifications = enabled
    await this.ensureReady()
    await this.bridge.invoke<void>('timer_configure_notifications', { enabled })
  }

  configureLifecycle = async (
    closeToTray: boolean,
    minimizeToTray: boolean,
  ): Promise<void> => {
    await this.ensureReady()
    await this.bridge.invoke<void>('desktop_configure_lifecycle', {
      closeToTray,
      minimizeToTray,
    })
  }

  selectMode = async (mode: TimerMode): Promise<void> => {
    await this.ensureReady()
    const snapshot = await this.bridge.invoke<TimerSnapshot>('timer_select_mode', { mode })
    this.applySnapshotIfChanged(snapshot)
  }

  reconcile = async (): Promise<void> => {
    await this.invokeCommand('timer_reconcile')
  }

  private ensureReady(): Promise<void> {
    if (this.readyPromise === null) {
      this.readyPromise = this.initialize().catch((error: unknown) => {
        this.readyPromise = null
        throw error
      })
    }
    return this.readyPromise
  }

  private async initialize(): Promise<void> {
    this.unlisten = await this.bridge.listen<TimerEvent>('timer:event', ({ payload }) => {
      this.snapshot = payload.snapshot
      this.emit(payload)
    })
    let snapshot: TimerSnapshot
    try {
      snapshot = await this.bridge.invoke<TimerSnapshot>('timer_initialize', {
        settings: this.settings,
        soundEnabled: this.soundEnabled,
        soundVolume: this.volume,
        desktopNotifications: this.desktopNotifications,
      })
    } catch (error: unknown) {
      this.unlisten()
      this.unlisten = null
      throw error
    }
    this.snapshot = snapshot
    this.emit({
      type: 'tick',
      eventId: 'projection:initialized',
      occurredAt: Date.now(),
      snapshot,
    })
  }

  private async invokeCommand(command: string): Promise<void> {
    await this.ensureReady()
    const snapshot = await this.bridge.invoke<TimerSnapshot>(command)
    this.applySnapshotIfChanged(snapshot)
  }

  private applySnapshotIfChanged(snapshot: TimerSnapshot): void {
    if (
      snapshot.mode === this.snapshot.mode
      && snapshot.status === this.snapshot.status
      && snapshot.remainingSeconds === this.snapshot.remainingSeconds
      && snapshot.durationSeconds === this.snapshot.durationSeconds
      && snapshot.startedAt === this.snapshot.startedAt
      && snapshot.targetEndTime === this.snapshot.targetEndTime
      && snapshot.sessionId === this.snapshot.sessionId
      && snapshot.completedFocusesInCycle === this.snapshot.completedFocusesInCycle
    ) return

    this.snapshot = snapshot
    this.emit({
      type: 'tick',
      eventId: 'projection:synchronized',
      occurredAt: Date.now(),
      snapshot,
    })
  }

  private emit(event: TimerEvent): void {
    for (const listener of [...this.listeners]) listener(event)
  }
}
