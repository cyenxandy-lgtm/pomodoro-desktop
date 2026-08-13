export const SOUND_SOURCE = '/sounds/chime.wav'
export const DEFAULT_SOUND_ENABLED = true
export const DEFAULT_VOLUME = 0.7

export interface AudioPlaybackTarget {
  currentTime: number
  volume: number
}

export const clampVolume = (value: unknown, fallback = DEFAULT_VOLUME): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

export const shouldPlaySound = (enabled: boolean, volume: number): boolean => (
  enabled && clampVolume(volume, 0) > 0
)

export const prepareAudioPlayback = (
  audio: AudioPlaybackTarget,
  enabled: boolean,
  volume: number,
): boolean => {
  if (!shouldPlaySound(enabled, volume)) return false
  audio.volume = clampVolume(volume, 0)
  audio.currentTime = 0
  return true
}
