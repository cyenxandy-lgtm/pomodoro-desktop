import { useCallback, useEffect, useRef } from 'react'
import { logger } from '../utils/logger'
import { prepareAudioPlayback, SOUND_SOURCE } from '../utils/sound'

interface UseSoundOptions {
  enabled: boolean
  volume: number
}

export const useSound = ({ enabled, volume }: UseSoundOptions) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => {
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  const playCompletionSound = useCallback(() => {
    const audio = audioRef.current ?? new Audio(SOUND_SOURCE)
    audioRef.current = audio
    audio.pause()
    if (!prepareAudioPlayback(audio, enabled, volume)) return

    void audio.play().catch((error: unknown) => {
      // Browsers can reject playback when no user gesture has occurred yet.
      logger.warn('Unable to play completion sound.', error)
    })
  }, [enabled, volume])

  return { playCompletionSound }
}
