import { useCallback, useEffect, useState } from 'react'
import type { TauriSessionRepository } from '../repositories/TauriSessionRepository'
import type { DailyRecords } from '../types'
import { logger } from '../utils/logger'

export const useSessionDailyRecords = (repository: TauriSessionRepository | null) => {
  const [dailyRecords, setDailyRecords] = useState<DailyRecords>({})

  const refresh = useCallback(async () => {
    if (repository === null) return
    try {
      setDailyRecords(await repository.getDailyRecords())
    } catch (error: unknown) {
      logger.error('Failed to load native session statistics.', error)
    }
  }, [repository])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { dailyRecords, refresh }
}
