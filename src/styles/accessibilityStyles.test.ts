/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (name: string): string => readFileSync(new URL(name, import.meta.url), 'utf8')

describe('visual accessibility contracts', () => {
  it('defines semantic tokens for both themes and every accent', () => {
    const theme = readStyle('./theme.css')
    expect(theme).toContain(":root[data-theme='dark']")
    expect(theme).toContain(":root[data-theme='light']")
    for (const accent of ['rose', 'mint', 'blue']) {
      expect(theme).toContain(`[data-accent='${accent}']`)
    }
  })

  it('disables non-essential motion when the operating system requests it', () => {
    const base = readStyle('../index.css')
    expect(base).toContain('@media (prefers-reduced-motion: reduce)')
    expect(base).toContain('animation-duration: 0.01ms !important')
  })
})
