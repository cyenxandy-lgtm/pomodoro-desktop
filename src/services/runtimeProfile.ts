import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './tauriRuntime'

export interface RuntimeProfile {
  testProfile: boolean
  smokeTimer: boolean
  smokeAutostart: boolean
}

declare global {
  interface Window {
    __POMODORO_RUNTIME_PROFILE__?: RuntimeProfile
  }
}

const productionProfile: RuntimeProfile = {
  testProfile: false,
  smokeTimer: false,
  smokeAutostart: false,
}

export const initializeRuntimeProfile = async (): Promise<RuntimeProfile> => {
  const profile = isTauriRuntime()
    ? await invoke<RuntimeProfile>('runtime_get_profile')
    : productionProfile
  window.__POMODORO_RUNTIME_PROFILE__ = profile
  return profile
}

export const isTestProfile = (): boolean => (
  typeof window !== 'undefined'
  && window.__POMODORO_RUNTIME_PROFILE__?.testProfile === true
)
