import { describe, expect, it } from 'vitest'
import type { TimerEvent, TimerSnapshot } from '../domain/timer'
import { TauriTimerService } from './TauriTimerService'
import type { TauriBridge } from './TauriTimerService'

const initialSnapshot: TimerSnapshot = {
  mode: 'focus',
  status: 'idle',
  remainingSeconds: 60,
  durationSeconds: 60,
  startedAt: null,
  targetEndTime: null,
  sessionId: null,
  completedFocusesInCycle: 0,
}

class FakeBridge implements TauriBridge {
  readonly calls: Array<{ command: string; args?: Record<string, unknown> }> = []
  private listener: ((event: { payload: TimerEvent }) => void) | null = null

  invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    this.calls.push({ command, args })
    return initialSnapshot as T
  }

  listen = async <T>(
    event: string,
    listener: (event: { payload: T }) => void,
  ): Promise<() => void> => {
    expect(event).toBe('timer:event')
    this.listener = listener as (event: { payload: TimerEvent }) => void
    return () => undefined
  }

  emit(event: TimerEvent): void {
    this.listener?.({ payload: event })
  }
}

const createService = (bridge: FakeBridge) => new TauriTimerService({
  settings: {
    focusMinutes: 1,
    breakMinutes: 2,
    longBreakMinutes: 3,
    longBreakInterval: 4,
    autoStartBreak: false,
    autoStartFocus: false,
  },
  soundEnabled: true,
  volume: 0.6,
  desktopNotifications: true,
  bridge,
})

describe('TauriTimerService', () => {
  it('registers the event listener before initializing Rust state', async () => {
    const bridge = new FakeBridge()
    const service = createService(bridge)
    const events: TimerEvent[] = []

    service.subscribe((event) => events.push(event))
    await Promise.resolve()
    await Promise.resolve()

    expect(bridge.calls[0]).toEqual({
      command: 'timer_initialize',
      args: {
        settings: {
          focusMinutes: 1,
          breakMinutes: 2,
          longBreakMinutes: 3,
          longBreakInterval: 4,
          autoStartBreak: false,
          autoStartFocus: false,
        },
        soundEnabled: true,
        soundVolume: 0.6,
        desktopNotifications: true,
      },
    })
    expect(events.at(-1)?.eventId).toBe('projection:initialized')
  })

  it('projects native events and delegates all commands to Rust', async () => {
    const bridge = new FakeBridge()
    const service = createService(bridge)
    const events: TimerEvent[] = []
    service.subscribe((event) => events.push(event))
    await Promise.resolve()
    await Promise.resolve()

    const runningSnapshot: TimerSnapshot = {
      ...initialSnapshot,
      status: 'running',
      startedAt: 1_000,
      targetEndTime: 61_000,
      sessionId: 'session:1',
    }
    bridge.emit({
      type: 'started',
      eventId: 'started:1',
      occurredAt: 1_000,
      sessionId: 'session:1',
      snapshot: runningSnapshot,
    })

    expect(service.getSnapshot()).toEqual(runningSnapshot)
    expect(events.at(-1)?.type).toBe('started')

    await service.start()
    await service.pause()
    await service.resume()
    await service.reset()
    await service.skip()
    await service.selectMode('shortBreak')
    await service.reconcile()
    await service.configure({
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      autoStartBreak: false,
      autoStartFocus: false,
    })
    await service.configureSound(false, 0.2)
    await service.configureNotifications(false)
    await service.configureLifecycle(true, false)

    expect(bridge.calls.slice(1).map(({ command }) => command)).toEqual([
      'timer_start',
      'timer_pause',
      'timer_resume',
      'timer_reset',
      'timer_skip',
      'timer_select_mode',
      'timer_reconcile',
      'timer_configure',
      'timer_configure_sound',
      'timer_configure_notifications',
      'desktop_configure_lifecycle',
    ])
    expect(bridge.calls[6].args).toEqual({ mode: 'shortBreak' })
  })
})
