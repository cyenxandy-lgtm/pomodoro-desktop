// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSound } from './useSound'

class FakeAudio {
  static instances: FakeAudio[] = []
  currentTime = 0
  volume = 1
  pause = vi.fn()
  play = vi.fn(() => Promise.resolve())

  constructor(_source: string) {
    FakeAudio.instances.push(this)
  }
}

afterEach(() => {
  cleanup()
  FakeAudio.instances = []
  vi.unstubAllGlobals()
})

describe('useSound', () => {
  it('reuses one audio element and stops the previous preview before replaying', () => {
    vi.stubGlobal('Audio', FakeAudio)
    const { result } = renderHook(() => useSound({ enabled: true, volume: 0.6 }))

    act(() => {
      result.current.playCompletionSound()
      result.current.playCompletionSound()
    })

    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.instances[0].pause).toHaveBeenCalledTimes(2)
    expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(2)
    expect(FakeAudio.instances[0].volume).toBe(0.6)
  })
})
