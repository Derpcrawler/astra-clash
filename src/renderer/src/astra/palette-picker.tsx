import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { ChevronUp } from 'lucide-react'
import { PALETTES, Palette } from './palettes'

// Astra Clash palette picker for Settings, Appearance. One row of compact
// tiles, as many as fit and at most five, then a "+N" tile that shows the rest in place.
// The swatch shows the palette's glows over its background with the accent as a dot; the
// description is the tooltip.

// Shown first, in this order; the rest follow.
const ORDER = ['m45', 'void', 'pine', 'carina', 'm27', 'm42', 'm16', 'm8', 'm78', 'andromeda', 'orion', 'helix', 'crab']
const ORDERED = [
  ...ORDER.map((id) => PALETTES.find((p) => p.id === id)).filter((p): p is Palette => !!p),
  ...PALETTES.filter((p) => !ORDER.includes(p.id))
]
const MAX_IN_ROW = 5
const TILE_MIN = 68
const GAP = 8

const SPOTS = ['20% 0%', '90% 100%', '55% 55%', '85% 0%']

function swatch(p: Palette, dark: boolean): React.CSSProperties {
  const t = dark ? p.dark : p.light
  const layers = t.glows.map((c, i) => {
    const strong = c.replace(/[\d.]+\)$/, i < 2 ? '.9)' : '.75)')
    return `radial-gradient(${i < 2 ? '60% 120%' : '40% 90%'} at ${SPOTS[i]}, ${strong}, transparent 70%)`
  })
  return { background: [...layers, t.bg].join(', ') }
}

interface Props {
  value: string
  onChange: (id: string) => void
}

const PalettePicker: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme !== 'light'
  const ref = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(MAX_IN_ROW + 1)
  const [expanded, setExpanded] = useState(false)

  // Columns that fit the card, counting the "+N more" tile.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const fit = Math.floor((entry.contentRect.width + GAP) / (TILE_MIN + GAP))
      setCols(Math.max(3, Math.min(MAX_IN_ROW + 1, fit)))
    })
    ro.observe(el)
    return (): void => ro.disconnect()
  }, [])

  let shown = ORDERED
  if (!expanded) {
    shown = ORDERED.slice(0, cols - 1)
    // A chosen palette from the hidden part takes the last slot, so the choice stays visible.
    const chosen = ORDERED.find((p) => p.id === value)
    if (chosen && !shown.includes(chosen)) shown = [...shown.slice(0, -1), chosen]
  }
  const hidden = ORDERED.length - shown.length

  return (
    <div ref={ref} className="astra-palette-row" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {shown.map((p) => {
        const tk = dark ? p.dark : p.light
        return (
          <button
            key={p.id}
            type="button"
            title={p.description}
            aria-pressed={p.id === value}
            onClick={() => onChange(p.id)}
            className="astra-palette-tile"
          >
            <span className="astra-palette-swatch" style={swatch(p, dark)}>
              <i
                style={{
                  background: tk.a2 ? `linear-gradient(140deg, ${tk.accent}, ${tk.a2})` : tk.accent,
                  boxShadow: `0 0 8px ${tk.accent}`
                }}
              />
            </span>
            <span className="astra-palette-name">{p.name}</span>
          </button>
        )
      })}
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="astra-palette-tile astra-palette-more"
        >
          <span className="astra-palette-swatch">
            {expanded ? <ChevronUp className="size-4" /> : `+${hidden}`}
          </span>
          <span className="astra-palette-name">
            {expanded ? t('astra.palettes.less') : t('astra.palettes.more')}
          </span>
        </button>
      )}
    </div>
  )
}

export default PalettePicker
