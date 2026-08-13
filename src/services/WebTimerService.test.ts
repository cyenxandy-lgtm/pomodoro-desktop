import { describe, expect, it } from 'vitest'
import type { Clock, TimerEvent, TimerSettings } from '../domain/timer'
import type { IntervalScheduler } from './WebTimerService'
import { WebTimerService } from './WebTimerService'

class FakeClock implements Clock {
  private timestamp: number

  constructor(timestamp: number) {
    this.timestamp = timestamp
  }

  now = (): number => this.timestamp

  advance(milliseconds: number): void {
    this.timestamp += milliseconds
  }
}

class ManualIntervalScheduler implements IntervalScheduler {
  private nextId = 1
  private readonly callbacks = new Map<number, () => void>()

  setInterval(callback: () => void): number {
    const id = this.nextId
    this.nextId += 1
    this.callbacks.set(id, callback)
    return id
  }

  clearInterval(handle: unknown): void {
    if (typeof handle === 'number') this.callbacks.delete(handle)
  }

  tick(): void {
    for (const callback of [...this.callbacks.values()]) callback()
  }

  get activeCount(): number {
    return this.callbacks.size
  }
}

const baseSettings: TimerSettings = {
  focusMinutes: 1,
  breakMinutes: 2,
  longBreakMinutes: 3,
  longBreakInterval: 4,
  autoStartBreak: false,
  autoStartFocus: false,
}

const createHarness = (settings: TimerSettings = baseSettings) => {
  const clock = new FakeClock(1_000_000)
  const scheduler = new ManualIntervalScheduler()
  let id = 0
  const service = new WebTimerService({
    settings,
    clock,
    scheduler,
    createId: () => String(++id),
  })
  const events: TimerEvent[] = []
  const unsubscribe = service.subscribe((event) => events.push(event))
  return { clock, scheduler, service, events, unsubscribe }
}

describe('WebTimerService', () => {
  it('starts with an idle Focus snapshot and no target', () => {
    const { service, scheduler, unsubscribe } = createHarness()

    expect(service.getSnapshot()).toEqual({
      mode: 'focus',
      status: 'idle',
      remainingSeconds: 60,
      durationSeconds: 60,
      startedAt: null,
      targetEndTime: null,
      sessionId: null,
      completedFocusesInCycle: 0,
    })
    expect(scheduler.activeCount).toBe(0)
    unsubscribe()
  })

  it('starts once and creates the wall-clock target', () => {
    const { service, scheduler, events, unsubscribe } = createHarness()

    service.start()
    service.start()

    expect(service.getSnapshot()).toMatchObject({
      status: 'running',
      startedAt: 1_000_000,
      targetEndTime: 1_060_000,
    })
    expect(events.filter((event) => event.type === 'started')).toHaveLength(1)
    expect(scheduler.activeCount).toBe(1)
    unsubscribe()
  })

  it('pauses with a stable remaining duration', () => {
    const { clock, service, scheduler, unsubscribe } = createHarness()
    service.start()
    clock.advance(5_200)
    service.pause()

    expect(service.getSnapshot()).toMatchObject({
      status: 'paused',
      remainingSeconds: 55,
      targetEndTime: null,
    })
    clock.advance(30_000)
    service.reconcile()
    expect(service.getSnapshot().remainingSeconds).toBe(55)
    expect(scheduler.activeCount).toBe(0)
    unsubscribe()
  })

  it('resumes with a newly calculated target', () => {
    const { clock, service, scheduler, unsubscribe } = createHarness()
    service.start()
    clock.advance(5_200)
    service.pause()
    const expiredTarget = 1_060_000
    clock.advance(70_000)

    service.resume()

    expect(service.getSnapshot()).toMatchObject({
      status: 'running',
      remainingSeconds: 55,
      targetEndTime: clock.now() + 55_000,
    })
    expect(service.getSnapshot().targetEndTime).not.toBe(expiredTarget)
    expect(scheduler.activeCount).toBe(1)
    unsubscribe()
  })

  it('resets without completion from running and paused states', () => {
    const { service, scheduler, events, unsubscribe } = createHarness()
    service.start()
    service.pause()
    service.reset()

    expect(service.getSnapshot()).toMatchObject({
      mode: 'focus',
      status: 'idle',
      remainingSeconds: 60,
      targetEndTime: null,
      sessionId: null,
    })
    expect(events.filter((event) => event.type === 'completed')).toHaveLength(0)
    expect(scheduler.activeCount).toBe(0)

    service.start()
    service.reset()
    expect(events.filter((event) => event.type === 'completed')).toHaveLength(0)
    unsubscribe()
  })

  it('completes Focus once and switches to an idle short break', () => {
    const { clock, service, scheduler, events, unsubscribe } = createHarness()
    service.start()
    clock.advance(60_000)

    scheduler.tick()
    scheduler.tick()
    service.reconcile()

    const completions = events.filter((event) => event.type === 'completed')
    expect(completions).toHaveLength(1)
    expect(completions[0]).toMatchObject({
      eventId: 'completion:session:1',
      mode: 'focus',
      plannedDurationSeconds: 60,
    })
    expect(service.getSnapshot()).toMatchObject({
      mode: 'shortBreak',
      status: 'idle',
      remainingSeconds: 120,
      targetEndTime: null,
    })
    expect(service.getSnapshot().remainingSeconds).toBeGreaterThanOrEqual(0)
    expect(scheduler.activeCount).toBe(0)
    unsubscribe()
  })

  it('reconciles sleep using the planned wall-clock completion time', () => {
    const { clock, service, events, unsubscribe } = createHarness()
    service.start()
    clock.advance(90_000)

    service.reconcile()

    expect(events.find((event) => event.type === 'completed')).toMatchObject({
      completedAt: 1_060_000,
      occurredAt: 1_090_000,
    })
    unsubscribe()
  })

  it('completes a short break and switches back to Focus', () => {
    const { clock, service, scheduler, events, unsubscribe } = createHarness()
    service.selectMode('shortBreak')
    service.start()
    clock.advance(120_000)
    scheduler.tick()

    expect(events.filter((event) => event.type === 'completed')).toHaveLength(1)
    expect(events.find((event) => event.type === 'completed')).toMatchObject({
      mode: 'shortBreak',
    })
    expect(service.getSnapshot()).toMatchObject({ mode: 'focus', status: 'idle' })
    unsubscribe()
  })

  it('switches modes manually without producing completion', () => {
    const { service, events, unsubscribe } = createHarness()
    service.selectMode('shortBreak')
    expect(service.getSnapshot()).toMatchObject({
      mode: 'shortBreak',
      status: 'idle',
      remainingSeconds: 120,
    })

    service.start()
    service.pause()
    service.selectMode('focus')

    expect(service.getSnapshot()).toMatchObject({
      mode: 'focus',
      status: 'idle',
      remainingSeconds: 60,
      sessionId: null,
    })
    expect(events.filter((event) => event.type === 'completed')).toHaveLength(0)
    unsubscribe()
  })

  it('keeps one interval during rapid Start, Pause and Resume commands', () => {
    const { service, scheduler, events, unsubscribe } = createHarness()

    service.start()
    service.start()
    service.pause()
    service.pause()
    service.resume()
    service.resume()

    expect(scheduler.activeCount).toBe(1)
    expect(events.filter((event) => event.type === 'started')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'paused')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'resumed')).toHaveLength(1)
    unsubscribe()
    expect(scheduler.activeCount).toBe(0)
  })

  it('enters Long Break at the configured cycle interval', () => {
    const { clock, service, scheduler, unsubscribe } = createHarness({
      ...baseSettings,
      longBreakInterval: 2,
    })
    service.start()
    clock.advance(60_000)
    scheduler.tick()
    service.selectMode('focus')
    service.start()
    clock.advance(60_000)
    scheduler.tick()

    expect(service.getSnapshot()).toMatchObject({
      mode: 'longBreak',
      status: 'idle',
      completedFocusesInCycle: 2,
    })
    unsubscribe()
  })

  it('completing or skipping Long Break resets the cycle', () => {
    const completeHarness = createHarness()
    completeHarness.service.selectMode('longBreak')
    completeHarness.service.start()
    completeHarness.clock.advance(180_000)
    completeHarness.scheduler.tick()
    expect(completeHarness.service.getSnapshot().completedFocusesInCycle).toBe(0)
    completeHarness.unsubscribe()

    const skipHarness = createHarness({
      ...baseSettings,
      autoStartFocus: true,
    })
    skipHarness.service.selectMode('longBreak')
    skipHarness.service.start()
    skipHarness.service.skip()
    expect(skipHarness.service.getSnapshot()).toMatchObject({
      mode: 'focus',
      status: 'idle',
      completedFocusesInCycle: 0,
    })
    skipHarness.unsubscribe()
  })

  it('auto-starts configured stages but never auto-starts after Skip', () => {
    const { clock, service, scheduler, unsubscribe } = createHarness({
      ...baseSettings,
      autoStartBreak: true,
      autoStartFocus: true,
    })
    service.start()
    clock.advance(60_000)
    scheduler.tick()
    expect(service.getSnapshot()).toMatchObject({ mode: 'shortBreak', status: 'running' })

    service.skip()
    expect(service.getSnapshot()).toMatchObject({ mode: 'focus', status: 'idle' })

    service.selectMode('shortBreak')
    service.start()
    clock.advance(120_000)
    scheduler.tick()
    expect(service.getSnapshot()).toMatchObject({ mode: 'focus', status: 'running' })
    unsubscribe()
  })
})
