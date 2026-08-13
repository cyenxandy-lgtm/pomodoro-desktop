import type { TimerService, TimerSettings } from '../domain/timer'
import { TauriSessionRepository } from '../repositories/TauriSessionRepository'
import { TauriTimerService } from './TauriTimerService'
import type { DesktopProductivitySettings, ShortcutStatus } from './TauriTimerService'
import { isTauriRuntime } from './tauriRuntime'
import { WebTimerService } from './WebTimerService'

export interface RuntimeServices {
  isNative: boolean
  timerService: TimerService
  sessionRepository: TauriSessionRepository | null
  configureSound(enabled: boolean, volume: number): Promise<void>
  configureNotifications(enabled: boolean): Promise<void>
  configureLifecycle(closeToTray: boolean, minimizeToTray: boolean): Promise<void>
  configureProductivity(settings: DesktopProductivitySettings): Promise<ShortcutStatus>
}

export const createRuntimeServices = (
  settings: TimerSettings,
  soundEnabled: boolean,
  volume: number,
  desktopNotifications: boolean,
): RuntimeServices => {
  if (!isTauriRuntime()) {
    return {
      isNative: false,
      timerService: new WebTimerService({ settings }),
      sessionRepository: null,
      configureSound: async () => undefined,
      configureNotifications: async () => undefined,
      configureLifecycle: async () => undefined,
      configureProductivity: async (productivity) => ({
        enabled: productivity.globalShortcutsEnabled,
        unavailable: [],
      }),
    }
  }

  const timerService = new TauriTimerService({
    settings,
    soundEnabled,
    volume,
    desktopNotifications,
  })
  return {
    isNative: true,
    timerService,
    sessionRepository: new TauriSessionRepository(),
    configureSound: (enabled, nextVolume) => (
      timerService.configureSound(enabled, nextVolume)
    ),
    configureNotifications: (enabled) => timerService.configureNotifications(enabled),
    configureLifecycle: (closeToTray, minimizeToTray) => (
      timerService.configureLifecycle(closeToTray, minimizeToTray)
    ),
    configureProductivity: (productivity) => (
      timerService.configureProductivity(productivity)
    ),
  }
}
