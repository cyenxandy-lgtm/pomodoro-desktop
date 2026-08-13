import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PersistedState } from '../types'
import { loadPersistedState, savePersistedState } from '../utils/storage'

interface PersistedStateResult {
  persistedState: PersistedState
  setPersistedState: Dispatch<SetStateAction<PersistedState>>
  hasStorageWarning: boolean
  retryPersistence: () => void
}

const FAILURE_THRESHOLD = 2

export const usePersistedState = (): PersistedStateResult => {
  const [persistedState, setPersistedState] = useState(loadPersistedState)
  const [hasStorageWarning, setHasStorageWarning] = useState(false)
  const consecutiveFailuresRef = useRef(0)

  const persist = useCallback(() => {
    const result = savePersistedState(persistedState)
    if (result.ok) {
      consecutiveFailuresRef.current = 0
      setHasStorageWarning(false)
      return
    }

    consecutiveFailuresRef.current += 1
    if (consecutiveFailuresRef.current >= FAILURE_THRESHOLD) setHasStorageWarning(true)
  }, [persistedState])

  useEffect(persist, [persist])

  return { persistedState, setPersistedState, hasStorageWarning, retryPersistence: persist }
}
