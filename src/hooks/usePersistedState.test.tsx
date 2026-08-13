// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePersistedState } from './usePersistedState'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('usePersistedState', () => {
  it('surfaces repeated save failures and clears the notice after retry succeeds', () => {
    const originalSetItem = Storage.prototype.setItem
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('quota unavailable') })
    const { result } = renderHook(usePersistedState)

    act(() => {
      result.current.setPersistedState((current) => ({ ...current, accent: 'blue' }))
    })
    expect(result.current.hasStorageWarning).toBe(true)

    setItem.mockImplementation(function write(this: Storage, key, value) {
      originalSetItem.call(this, key, value)
    })
    act(() => result.current.retryPersistence())
    expect(result.current.hasStorageWarning).toBe(false)
  })
})
