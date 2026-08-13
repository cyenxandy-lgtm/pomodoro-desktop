import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { isTauriRuntime } from '../services/tauriRuntime'
import { logger } from '../utils/logger'

export const useAppVersion = (): string => {
  const [version, setVersion] = useState(__APP_VERSION__)

  useEffect(() => {
    if (!isTauriRuntime()) return
    void getVersion()
      .then(setVersion)
      .catch((error: unknown) => logger.warn('Unable to read application version.', error))
  }, [])

  return version
}
