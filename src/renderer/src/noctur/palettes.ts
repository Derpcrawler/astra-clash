// Noctur palettes: Noctur, with a dark and a light (twilight) version, and Void, black and white,
// dark only; the app stays dark while Void is chosen (App.tsx). A saved id that is not listed here
// (an earlier palette) falls back to Noctur.
// The values are applied as --p-* variables; fork-theme.css maps them onto the app's own tokens.

export interface PaletteTokens {
  bg: string
  surface: string
  raised: string
  fg: string
  fg2: string
  fg3: string
  accent: string
  strong: string
  // Second accent for gradients. Two-color palettes leave it out and use `strong`.
  a2?: string
  on: string
  text: string
  // Background glows, two or four. Missing ones are transparent.
  glows: string[]
  // Star colors as "r,g,b" values; the star field picks one per star.
  tints: string[]
}

export interface Palette {
  id: string
  name: string
  description: string
  group: 'plain' | 'two' | 'nebula'
  dark: PaletteTokens
  light?: PaletteTokens
}

export const DEFAULT_PALETTE = 'noctur'

export const PALETTES: Palette[] = [
  // Light text is a deep twilight navy, not near black, so it sits with the sky (owner, 2026-10-11;
  // #121a33 before).
  {
    id: 'noctur',
    name: 'Noctur',
    description: 'Night navy with blue and lavender glows; twilight in light mode',
    group: 'nebula',
    dark: { bg: '#050812', surface: '#0d1427', raised: '#141c33', fg: '#f2f4fa', fg2: '#a8b0c5', fg3: '#7a8299', accent: '#c3d3ff', strong: '#8fa8ff', a2: '#a08cff', on: '#0b1230', text: '#ffffff', glows: ['rgba(52,98,168,.75)', 'rgba(160,140,255,.20)', 'rgba(143,168,255,.26)', 'rgba(30,61,115,.55)'], tints: ['255,255,255', '211,226,255', '255,230,191', '195,181,255'] },
    light: { bg: '#eef1f8', surface: '#ffffff', raised: '#e6ebf5', fg: '#26386b', fg2: '#4a5573', fg3: '#6b7590', accent: '#4f6bc9', strong: '#3f5bb8', a2: '#8c7be0', on: '#ffffff', text: '#26386b', glows: ['rgba(143,168,255,.42)', 'rgba(195,181,255,.30)', 'rgba(160,140,255,.22)', 'rgba(143,168,255,.20)'], tints: ['255,255,255'] }
  },
  {
    id: 'void',
    name: 'Void',
    description: 'Black and white, no color',
    group: 'plain',
    dark: { bg: '#050505', surface: '#0f0f10', raised: '#19191b', fg: '#f2f2f2', fg2: '#b0b0b0', fg3: '#808080', accent: '#f2f2f2', strong: '#cfcfcf', a2: '#8f8f8f', on: '#0a0a0a', text: '#f2f2f2', glows: ['rgba(255,255,255,.10)', 'rgba(255,255,255,.05)'], tints: ['255,255,255'] }
  }
]

export function findPalette(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE)!
}

// The --p-* variables of one palette version, as name and value pairs.
export function paletteVars(t: PaletteTokens, dark: boolean): [string, string][] {
  const g = [...t.glows, 'transparent', 'transparent', 'transparent', 'transparent'].slice(0, 4)
  return [
    ['--p-bg', t.bg],
    ['--p-surface', t.surface],
    ['--p-raised', t.raised],
    ['--p-fg', t.fg],
    ['--p-fg2', t.fg2],
    ['--p-fg3', t.fg3],
    ['--p-accent', t.accent],
    ['--p-strong', t.strong],
    ['--p-accent2', t.a2 ?? t.strong],
    ['--p-on', t.on],
    ['--p-text', t.text],
    ['--p-glow1', g[0]],
    ['--p-glow2', g[1]],
    ['--p-glow3', g[2]],
    ['--p-glow4', g[3]],
    ['--p-tints', t.tints.join('|')],
    ['--p-line', dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'],
    ['--p-line-strong', dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.16)']
  ]
}

function vars(t: PaletteTokens, dark: boolean): string {
  return paletteVars(t, dark)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}

// Whether a palette has a light version; the app is dark with every other one.
export function hasLight(id: string | undefined): boolean {
  return !!findPalette(id).light
}

// CSS for one palette. The app's .dark class picks the dark version.
export function paletteCss(p: Palette): string {
  return `:root[data-palette]{${vars(p.light ?? p.dark, !p.light)}}:root.dark[data-palette]{${vars(p.dark, true)}}`
}

// Applies a palette, or removes it so an imported custom theme shows as its author made it.
export function applyPalette(id: string | null): void {
  const root = document.documentElement
  let style = document.getElementById('noctur-palette') as HTMLStyleElement | null
  if (!id) {
    delete root.dataset.palette
    style?.remove()
    window.dispatchEvent(new Event('noctur:palette'))
    return
  }
  const p = findPalette(id)
  if (!style) {
    style = document.createElement('style')
    style.id = 'noctur-palette'
    document.head.appendChild(style)
  }
  style.textContent = paletteCss(p)
  root.dataset.palette = p.id
  window.dispatchEvent(new Event('noctur:palette'))
}
