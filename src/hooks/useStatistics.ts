import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildStatisticsViewModel,
  mergeDailyStatistics,
} from '../domain/statistics'
import type { NativeStatisticsSnapshot, StatisticsViewModel } from '../domain/statistics'
import type { StatisticsService } from '../services/StatisticsService'
import type { DailyRecords } from '../types'
import { logger } from '../utils/logger'

interface StatisticsState {
  snapshot: NativeStatisticsSnapshot
  loading: boolean
  error: boolean
}

interface UseStatisticsResult {
  data: StatisticsViewModel
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
}

const emptySnapshot: NativeStatisticsSnapshot = { daily: [], recentSessions: [] }

export const useStatistics = (
  service: StatisticsService,
  legacyRecords: DailyRecords,
  today: string,
): UseStatisticsResult => {
  const [state, setState] = useState<StatisticsState>({
    snapshot: emptySnapshot,
    loading: true,
    error: false,
  })
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState((current) => ({ ...current, loading: true, error: false }))
    try {
      const snapshot = await service.getSnapshot({
        startDate: null,
        endDate: today,
        recentLimit: 30,
      })
      if (requestId === requestIdRef.current) {
        setState({ snapshot, loading: false, error: false })
      }
    } catch (error: unknown) {
      logger.error('Failed to load statistics.', error)
      if (requestId === requestIdRef.current) {
        setState((current) => ({ ...current, loading: false, error: true }))
      }
    }
  }, [service, today])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      requestIdRef.current += 1
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh])

  const data = useMemo(() => buildStatisticsViewModel(
    mergeDailyStatistics(legacyRecords, state.snapshot.daily),
    state.snapshot.recentSessions,
    today,
  ), [legacyRecords, state.snapshot, today])

  return { data, loading: state.loading, error: state.error, refresh }
}
