import { useEffect, useState } from 'react'
import { createLocalDateBoundaryWatcher, getLocalDateKey } from '../utils/localDate'

export const useTodayKey = (): string => {
  const [todayKey, setTodayKey] = useState(getLocalDateKey)

  useEffect(() => {
    const watcher = createLocalDateBoundaryWatcher({ onDateChange: setTodayKey })
    return () => watcher.dispose()
  }, [])

  return todayKey
}
