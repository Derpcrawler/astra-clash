// Astra Clash palettes. Each palette has a dark and a light version.
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
  light: PaletteTokens
}

export const DEFAULT_PALETTE = 'm45'

export const PALETTES: Palette[] = [
  {
    id: 'void',
    name: 'Void',
    description: 'Black and white, no color',
    group: 'plain',
    dark: { bg: '#050505', surface: '#0f0f10', raised: '#19191b', fg: '#f2f2f2', fg2: '#b0b0b0', fg3: '#808080', accent: '#f2f2f2', strong: '#cfcfcf', a2: '#8f8f8f', on: '#0a0a0a', text: '#f2f2f2', glows: ['rgba(255,255,255,.10)', 'rgba(255,255,255,.05)'], tints: ['255,255,255'] },
    light: { bg: '#f5f5f5', surface: '#ffffff', raised: '#ebebeb', fg: '#0a0a0a', fg2: '#444444', fg3: '#6a6a6a', accent: '#111111', strong: '#111111', a2: '#555555', on: '#ffffff', text: '#111111', glows: ['rgba(0,0,0,.07)', 'rgba(0,0,0,.04)'], tints: ['0,0,0'] }
  },
  {
    id: 'pine',
    name: 'Pine',
    description: 'Deep forest green',
    group: 'plain',
    dark: { bg: '#060a08', surface: '#0c1512', raised: '#122019', fg: '#eaf2ee', fg2: '#a7b8b0', fg3: '#7c8d85', accent: '#34d399', strong: '#10b981', on: '#04241a', text: '#34d399', glows: ['rgba(52,211,153,.30)', '#123524'], tints: ['234,242,238'] },
    light: { bg: '#f4f7f5', surface: '#ffffff', raised: '#e9efeb', fg: '#0b1210', fg2: '#3f5148', fg3: '#5f7168', accent: '#0e9f6e', strong: '#0e9f6e', on: '#ffffff', text: '#0b7a55', glows: ['rgba(14,159,110,.22)', '#cfe8dc'], tints: ['15,59,46'] }
  },
  {
    id: 'carina',
    name: 'Carina',
    description: 'Violet and pink of the Carina Nebula',
    group: 'two',
    dark: { bg: '#0a0812', surface: '#141021', raised: '#1c1630', fg: '#f0ecf8', fg2: '#b4abc8', fg3: '#857c99', accent: '#b99cff', strong: '#8f6dff', on: '#1a0f33', text: '#c4acff', glows: ['rgba(255,110,190,.26)', '#2a1752'], tints: ['240,236,248'] },
    light: { bg: '#f7f5fb', surface: '#ffffff', raised: '#eeeaf6', fg: '#130f1c', fg2: '#4a4260', fg3: '#6c6482', accent: '#6e4fe0', strong: '#6e4fe0', on: '#ffffff', text: '#5b3cc9', glows: ['rgba(236,72,153,.16)', '#e4dcff'], tints: ['60,40,120'] }
  },
  {
    id: 'orion',
    name: 'Rosette',
    description: 'Rosette Nebula: rose on deep blue',
    group: 'two',
    dark: { bg: '#0a0a12', surface: '#13131f', raised: '#1b1b2b', fg: '#f3eff2', fg2: '#b7afbd', fg3: '#88808f', accent: '#ff8fa3', strong: '#f2607c', on: '#2b0710', text: '#ff9db0', glows: ['rgba(255,120,150,.24)', '#16204a'], tints: ['243,239,242'] },
    light: { bg: '#fbf6f7', surface: '#ffffff', raised: '#f3eaec', fg: '#1a0f12', fg2: '#5a4549', fg3: '#7a666a', accent: '#d63d5e', strong: '#d63d5e', on: '#ffffff', text: '#b92d4d', glows: ['rgba(214,61,94,.14)', '#dde3fb'], tints: ['120,30,50'] }
  },
  {
    id: 'helix',
    name: 'Helix',
    description: 'Cyan core and amber rim of the Helix Nebula',
    group: 'two',
    dark: { bg: '#05090c', surface: '#0c1418', raised: '#121d23', fg: '#e9f3f5', fg2: '#a5b9bf', fg3: '#788d93', accent: '#4fd8e8', strong: '#1fb8cc', on: '#032126', text: '#5fe0ee', glows: ['rgba(79,216,232,.26)', 'rgba(255,130,70,.30)'], tints: ['233,243,245'] },
    light: { bg: '#f3f8f9', surface: '#ffffff', raised: '#e6eff1', fg: '#0a1417', fg2: '#3c5157', fg3: '#5d7278', accent: '#0c8fa3', strong: '#0c8fa3', on: '#ffffff', text: '#08798a', glows: ['rgba(12,143,163,.16)', 'rgba(255,140,80,.18)'], tints: ['10,70,80'] }
  },
  {
    id: 'crab',
    name: 'Crab',
    description: 'Amber filaments of the Crab Nebula on teal',
    group: 'two',
    dark: { bg: '#0b0906', surface: '#16120c', raised: '#1f1911', fg: '#f6f0e6', fg2: '#bfb3a0', fg3: '#8f846f', accent: '#ffb45c', strong: '#f59a2e', on: '#2a1600', text: '#ffbf70', glows: ['rgba(255,170,80,.24)', '#0f3440'], tints: ['246,240,230'] },
    light: { bg: '#faf7f1', surface: '#ffffff', raised: '#f2ece0', fg: '#1a140a', fg2: '#5a4d38', fg3: '#7a6d57', accent: '#b8650a', strong: '#c96f0c', on: '#ffffff', text: '#9a5406', glows: ['rgba(230,140,40,.16)', '#d6ecef'], tints: ['110,70,10'] }
  },
  {
    id: 'andromeda',
    name: 'Andromeda',
    description: 'Ice blue galaxy core with violet dust',
    group: 'two',
    dark: { bg: '#06080f', surface: '#0d1220', raised: '#141b2d', fg: '#eef2fa', fg2: '#aab4c8', fg3: '#7c869a', accent: '#8ec5ff', strong: '#5aa6ff', on: '#061a33', text: '#9dcdff', glows: ['rgba(120,180,255,.26)', '#26184a'], tints: ['238,242,250'] },
    light: { bg: '#f5f7fb', surface: '#ffffff', raised: '#e9eef7', fg: '#0b1020', fg2: '#435069', fg3: '#65718a', accent: '#2f6fd6', strong: '#2f6fd6', on: '#ffffff', text: '#2459b8', glows: ['rgba(47,111,214,.14)', '#e6defc'], tints: ['30,50,110'] }
  },
  {
    id: 'm27',
    name: 'Dumbbell',
    description: 'M27, Dumbbell Nebula: green, cyan, blue, violet',
    group: 'nebula',
    dark: { bg: '#040b08', surface: '#0b1511', raised: '#111f19', fg: '#eaf3ee', fg2: '#a7b8b0', fg3: '#7c8d85', accent: '#3ee0a0', strong: '#10b981', a2: '#5fd0e8', on: '#03231a', text: '#4fe6aa', glows: ['rgba(52,211,153,.36)', 'rgba(40,175,205,.30)', 'rgba(60,105,230,.26)', 'rgba(125,90,235,.22)'], tints: ['255,255,255', '200,255,230', '190,230,255', '215,205,255'] },
    light: { bg: '#f4f7f5', surface: '#ffffff', raised: '#e9efeb', fg: '#0b1210', fg2: '#3f5148', fg3: '#5f7168', accent: '#0e9f6e', strong: '#0e9f6e', a2: '#0f86a3', on: '#ffffff', text: '#0b7a55', glows: ['rgba(14,159,110,.17)', 'rgba(20,140,170,.14)', 'rgba(50,90,210,.10)', 'rgba(110,80,220,.08)'], tints: ['15,59,46', '20,90,110', '60,60,150'] }
  },
  {
    id: 'm78',
    name: 'Casper',
    description: 'M78, Casper Nebula: magenta, violet and blue, with warm stars',
    group: 'nebula',
    dark: { bg: '#07040f', surface: '#120b1f', raised: '#1a1030', fg: '#f3ecfb', fg2: '#b9a9cf', fg3: '#8a7aa3', accent: '#d69cff', strong: '#a45cff', a2: '#5b6bff', on: '#1a0833', text: '#dcaaff', glows: ['rgba(214,60,255,.36)', 'rgba(80,70,255,.36)', 'rgba(232,200,255,.22)', 'rgba(255,110,200,.22)'], tints: ['255,255,255', '255,186,120', '214,190,255', '255,150,220'] },
    light: { bg: '#f8f4fd', surface: '#ffffff', raised: '#efe7fa', fg: '#150c22', fg2: '#4d3d66', fg3: '#6f5f88', accent: '#8a3ee0', strong: '#8a3ee0', a2: '#4452e0', on: '#ffffff', text: '#7430c8', glows: ['rgba(200,80,255,.17)', 'rgba(90,110,255,.15)', 'rgba(255,150,210,.14)', 'rgba(180,160,255,.12)'], tints: ['90,40,150', '150,60,120'] }
  },
  {
    id: 'm42',
    name: 'Orion',
    description: 'M42, Orion Nebula: violet, periwinkle, teal, pink core',
    group: 'nebula',
    dark: { bg: '#070614', surface: '#110f22', raised: '#19162f', fg: '#eeeefb', fg2: '#aeb0cf', fg3: '#8082a3', accent: '#a9adff', strong: '#7a6cff', a2: '#5fe0c0', on: '#0c0a2a', text: '#b4b8ff', glows: ['rgba(122,90,255,.36)', 'rgba(95,224,192,.26)', 'rgba(255,110,210,.24)', 'rgba(150,160,255,.26)'], tints: ['255,255,255', '200,210,255', '255,200,240', '190,255,235'] },
    light: { bg: '#f5f5fd', surface: '#ffffff', raised: '#ebebf8', fg: '#0f0e22', fg2: '#45466a', fg3: '#66688a', accent: '#5a4fe0', strong: '#5a4fe0', a2: '#139c7e', on: '#ffffff', text: '#4a3fd0', glows: ['rgba(122,90,255,.15)', 'rgba(40,190,160,.15)', 'rgba(240,90,190,.12)', 'rgba(150,160,255,.13)'], tints: ['60,50,140', '20,120,100'] }
  },
  {
    id: 'm16',
    name: 'Eagle',
    description: 'M16, Eagle Nebula (Pillars of Creation): teal sky, rust, gold',
    group: 'nebula',
    dark: { bg: '#050b0a', surface: '#0d1614', raised: '#14201d', fg: '#eef3ef', fg2: '#b0bfb7', fg3: '#80918a', accent: '#ecbf72', strong: '#d49a3c', a2: '#5fc8b0', on: '#241400', text: '#f0c47a', glows: ['rgba(70,160,140,.38)', 'rgba(170,85,30,.36)', 'rgba(235,185,100,.22)', 'rgba(255,80,210,.14)'], tints: ['255,255,255', '255,120,230', '255,222,170'] },
    light: { bg: '#f6f8f5', surface: '#ffffff', raised: '#ebf0ea', fg: '#0d1512', fg2: '#43524b', fg3: '#65746d', accent: '#9a5d10', strong: '#9a5d10', a2: '#177a68', on: '#ffffff', text: '#8a4f08', glows: ['rgba(40,140,120,.16)', 'rgba(170,100,40,.15)', 'rgba(230,180,100,.15)', 'rgba(255,80,200,.07)'], tints: ['40,90,80', '130,70,20'] }
  },
  {
    id: 'm8',
    name: 'Lagoon',
    description: 'M8, Lagoon Nebula: pink and gold over teal',
    group: 'nebula',
    dark: { bg: '#0b0710', surface: '#16101c', raised: '#1f1726', fg: '#f7eef3', fg2: '#c4b2bd', fg3: '#94828d', accent: '#ff97c2', strong: '#f0609c', a2: '#ffc46b', on: '#2b0718', text: '#ffa3c9', glows: ['rgba(255,100,160,.34)', 'rgba(40,125,145,.34)', 'rgba(255,196,107,.22)', 'rgba(120,80,255,.22)'], tints: ['255,255,255', '255,210,160', '180,220,255', '255,170,210'] },
    light: { bg: '#fcf6f8', surface: '#ffffff', raised: '#f5eaef', fg: '#1c0f15', fg2: '#5c4450', fg3: '#7d6571', accent: '#d0407a', strong: '#d0407a', a2: '#b77410', on: '#ffffff', text: '#b8306a', glows: ['rgba(240,90,150,.15)', 'rgba(40,140,160,.14)', 'rgba(240,180,90,.15)', 'rgba(120,80,255,.08)'], tints: ['140,40,80', '120,80,20'] }
  },
  {
    id: 'm45',
    name: 'Pleiades',
    description: 'M45, Pleiades: blue haze, deep blue, lavender',
    group: 'nebula',
    dark: { bg: '#050812', surface: '#0c1221', raised: '#131b2f', fg: '#eef2fa', fg2: '#aab4c8', fg3: '#7c869a', accent: '#9ccfff', strong: '#5aa6ff', a2: '#c3b5ff', on: '#061a33', text: '#a8d4ff', glows: ['rgba(110,170,255,.36)', 'rgba(60,90,220,.32)', 'rgba(210,230,255,.22)', 'rgba(170,140,255,.22)'], tints: ['255,255,255', '200,225,255', '180,200,255', '230,220,255'] },
    light: { bg: '#f5f7fb', surface: '#ffffff', raised: '#e9eef7', fg: '#0b1020', fg2: '#435069', fg3: '#65718a', accent: '#2f6fd6', strong: '#2f6fd6', a2: '#6a55d8', on: '#ffffff', text: '#2459b8', glows: ['rgba(47,111,214,.15)', 'rgba(60,90,220,.12)', 'rgba(150,190,255,.14)', 'rgba(140,110,240,.10)'], tints: ['30,50,110', '70,60,150'] }
  }
]

export function findPalette(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE)!
}

function vars(t: PaletteTokens, dark: boolean): string {
  const g = [...t.glows, 'transparent', 'transparent', 'transparent', 'transparent'].slice(0, 4)
  return [
    `--p-bg:${t.bg}`,
    `--p-surface:${t.surface}`,
    `--p-raised:${t.raised}`,
    `--p-fg:${t.fg}`,
    `--p-fg2:${t.fg2}`,
    `--p-fg3:${t.fg3}`,
    `--p-accent:${t.accent}`,
    `--p-strong:${t.strong}`,
    `--p-accent2:${t.a2 ?? t.strong}`,
    `--p-on:${t.on}`,
    `--p-text:${t.text}`,
    `--p-glow1:${g[0]}`,
    `--p-glow2:${g[1]}`,
    `--p-glow3:${g[2]}`,
    `--p-glow4:${g[3]}`,
    `--p-tints:${t.tints.join('|')}`,
    `--p-line:${dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'}`,
    `--p-line-strong:${dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.16)'}`
  ].join(';')
}

// CSS for one palette. The app's .dark class picks the dark version.
export function paletteCss(p: Palette): string {
  return `:root[data-palette]{${vars(p.light, false)}}:root.dark[data-palette]{${vars(p.dark, true)}}`
}

// Applies a palette, or removes it so an imported custom theme shows as its author made it.
export function applyPalette(id: string | null): void {
  const root = document.documentElement
  let style = document.getElementById('astra-palette') as HTMLStyleElement | null
  if (!id) {
    delete root.dataset.palette
    style?.remove()
    window.dispatchEvent(new Event('astra:palette'))
    return
  }
  const p = findPalette(id)
  if (!style) {
    style = document.createElement('style')
    style.id = 'astra-palette'
    document.head.appendChild(style)
  }
  style.textContent = paletteCss(p)
  root.dataset.palette = p.id
  window.dispatchEvent(new Event('astra:palette'))
}
