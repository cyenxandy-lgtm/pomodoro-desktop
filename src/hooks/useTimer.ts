import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type {
  TimerCompletedEvent,
  TimerMode,
  TimerService,
  TimerSettings,
  TimerSnapshot,
} from '../domain/timer'
import { WebTimerService } from '../services/WebTimerService'
import { logger } from '../utils/logger'

interface UseTimerOptions {
  settings: TimerSettings
  onComplete: (completion: TimerCompletedEvent) => void
  service?: TimerService
}

interface UseTimerResult extends TimerSnapshot {
  isReady: boolean
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  skip: () => void
  selectMode: (nextMode: TimerMode) => void
}

export const useTimer = ({ settings, onComplete, service }: UseTimerOptions): UseTimerResult => {
  const ownedServiceRef = useRef<TimerService | null>(null)
  if (ownedServiceRef.current === null) {
    ownedServiceRef.current = service ?? new WebTimerService({ settings })
  }
  const timerService = ownedServiceRef.current

  const completionHandlerRef = useRef(onComplete)
  completionHandlerRef.current = onComplete

  const subscribe = useCallback((onSnapshotChange: () => void) => (
    timerService.subscribe((event) => {
      if (event.type === 'completed') completionHandlerRef.current(event)
      onSnapshotChange()
    })
  ), [timerService])

  const snapshot = useSyncExternalStore(
    subscribe,
    timerService.getSnapshot,
    timerService.getSnapshot,
  )

  useEffect(() => {
    Promise.resolve(timerService.configure(settings)).catch((error: unknown) => {
      logger.error('Failed to configure timer.', error)
    })
  }, [settings, timerService])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        Promise.resolve(timerService.reconcile()).catch((error: unknown) => {
          logger.error('Failed to reconcile timer.', error)
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
  }, [timerService])

  return {
    ...snapshot,
    isReady: timerService.isReady?.() ?? true,
    start: useCallback(() => {
      Promise.resolve(timerService.start()).catch((error: unknown) => {
        logger.error('Failed to start timer.', error)
      })
    }, [timerService]),
    pause: useCallback(() => {
      Promise.resolve(timerService.pause()).catch((error: unknown) => {
        logger.error('Failed to pause timer.', error)
      })
    }, [timerService]),
    resume: useCallback(() => {
      Promise.resolve(timerService.resume()).catch((error: unknown) => {
        logger.error('Failed to resume timer.', error)
      })
    }, [timerService]),
    reset: useCallback(() => {
      Promise.resolve(timerService.reset()).catch((error: unknown) => {
        logger.error('Failed to reset timer.', error)
      })
    }, [timerService]),
    skip: useCallback(() => {
      Promise.resolve(timerService.skip()).catch((error: unknown) => {
        logger.error('Failed to skip timer.', error)
      })
    }, [timerService]),
    selectMode: useCallback((mode: TimerMode) => {
      Promise.resolve(timerService.selectMode(mode)).catch((error: unknown) => {
        logger.error('Failed to select timer mode.', error)
      })
    }, [timerService]),
  }
}
