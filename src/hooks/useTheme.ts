import { useEffect } from 'react'
import type { Accent, Appearance } from '../domain/appearance'
import { resolveTheme } from '../domain/appearance'

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export const applyTheme = (
  root: HTMLElement,
  appearance: Appearance,
  accent: Accent,
  systemPrefersDark: boolean,
): void => {
  const theme = resolveTheme(appearance, systemPrefersDark)
  root.dataset.appearance = appearance
  root.dataset.theme = theme
  root.dataset.accent = accent
  root.style.colorScheme = theme
}

export const useTheme = (appearance: Appearance, accent: Accent): void => {
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia?.(DARK_MEDIA_QUERY)
    const update = () => applyTheme(root, appearance, accent, media?.matches ?? false)
    update()
    media?.addEventListener('change', update)
    return () => media?.removeEventListener('change', update)
  }, [accent, appearance])
}
