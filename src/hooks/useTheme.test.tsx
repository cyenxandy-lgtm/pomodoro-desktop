// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'
import type { Accent, Appearance } from '../domain/appearance'

const listeners = new Set<() => void>()
let prefersDark = false

const installMatchMedia = () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return prefersDark },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

afterEach(() => {
  listeners.clear()
  prefersDark = false
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
  document.documentElement.removeAttribute('data-appearance')
  document.documentElement.style.colorScheme = ''
  vi.unstubAllGlobals()
})

describe('useTheme', () => {
  it('applies explicit dark and light themes with the selected accent', () => {
    installMatchMedia()
    type ThemeProps = { appearance: Appearance; accent: Accent }
    const { rerender } = renderHook(
      ({ appearance, accent }: ThemeProps) => useTheme(appearance, accent),
      { initialProps: { appearance: 'dark', accent: 'rose' } as ThemeProps },
    )
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.accent).toBe('rose')

    rerender({ appearance: 'light', accent: 'blue' })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.accent).toBe('blue')
  })

  it('tracks system preference only while appearance is system', () => {
    installMatchMedia()
    const { rerender } = renderHook(
      ({ appearance }) => useTheme(appearance, 'mint'),
      { initialProps: { appearance: 'system' as 'system' | 'dark' } },
    )
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => {
      prefersDark = true
      listeners.forEach((listener) => listener())
    })
    expect(document.documentElement.dataset.theme).toBe('dark')

    rerender({ appearance: 'dark' })
    act(() => {
      prefersDark = false
      listeners.forEach((listener) => listener())
    })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
