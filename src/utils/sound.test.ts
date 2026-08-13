import { describe, expect, it } from 'vitest'
import { prepareAudioPlayback, shouldPlaySound } from './sound'

describe('sound playback settings', () => {
  it('does not prepare audio when sound is disabled or muted', () => {
    const audio = { currentTime: 4, volume: 1 }

    expect(shouldPlaySound(false, 0.7)).toBe(false)
    expect(shouldPlaySound(true, 0)).toBe(false)
    expect(prepareAudioPlayback(audio, false, 0.7)).toBe(false)
    expect(audio).toEqual({ currentTime: 4, volume: 1 })
  })

  it('applies the configured volume and rewinds the local sound', () => {
    const audio = { currentTime: 4, volume: 1 }

    expect(shouldPlaySound(true, 0.7)).toBe(true)
    expect(prepareAudioPlayback(audio, true, 0.7)).toBe(true)
    expect(audio).toEqual({ currentTime: 0, volume: 0.7 })
  })
})
