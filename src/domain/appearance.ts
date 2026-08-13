export type Appearance = 'dark' | 'light' | 'system'
export type Accent = 'mint' | 'rose' | 'blue'
export type ResolvedTheme = 'dark' | 'light'

export const APPEARANCES: readonly Appearance[] = ['dark', 'light', 'system']
export const ACCENTS: readonly Accent[] = ['mint', 'rose', 'blue']

export const isAppearance = (value: unknown): value is Appearance => (
  typeof value === 'string' && APPEARANCES.includes(value as Appearance)
)

export const isAccent = (value: unknown): value is Accent => (
  typeof value === 'string' && ACCENTS.includes(value as Accent)
)

export const resolveTheme = (
  appearance: Appearance,
  systemPrefersDark: boolean,
): ResolvedTheme => (
  appearance === 'system' ? (systemPrefersDark ? 'dark' : 'light') : appearance
)
