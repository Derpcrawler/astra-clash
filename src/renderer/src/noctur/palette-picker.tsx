import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { ChevronUp } from 'lucide-react'
import { PALETTES, Palette, findPalette } from './palettes'
import { Look, LookPreview } from './look-preview'

// Noctur palette picker for Settings, Appearance. One row of compact
// tiles, as many as fit and at most five, then a "+N" tile that shows the rest in place.
// Each tile shows the look in use drawn in that palette, still and connected (look-preview.tsx);
// the description is the tooltip.

// Shown first, in this order; the rest follow.
const ORDER = ['noctur', 'void']
const ORDERED = [
  ...ORDER.map((id) => PALETTES.find((p) => p.id === id)).filter((p): p is Palette => !!p),
  ...PALETTES.filter((p) => !ORDER.includes(p.id))
]
const MAX_IN_ROW = 5
const TILE_MIN = 68
const GAP = 8

interface Props {
  value: string
  look: Look
  onChange: (id: string) => void
}

const PalettePicker: React.FC<Props> = ({ value: saved, look, onChange }) => {
  // A saved palette that no longer exists shows as the one in use, Noctur.
  const value = findPalette(saved).id
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
  // As many columns as tiles when they all fit, so two palettes fill the row instead of leaving
  // empty columns.
  const columns = Math.min(cols, shown.length + (hidden > 0 || expanded ? 1 : 0))

  return (
    <div ref={ref} className="noctur-palette-row" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {shown.map((p) => (
        <button
          key={p.id}
          type="button"
          title={p.description}
          aria-pressed={p.id === value}
          onClick={() => onChange(p.id)}
          className="noctur-palette-tile"
        >
          <LookPreview look={look} light={!dark} play={false} palette={p} />
          <span className="noctur-palette-name">{p.name}</span>
        </button>
      ))}
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="noctur-palette-tile noctur-palette-more"
        >
          <span className="noctur-palette-swatch">
            {expanded ? <ChevronUp className="size-4" /> : `+${hidden}`}
          </span>
          <span className="noctur-palette-name">
            {expanded ? t('noctur.palettes.less') : t('noctur.palettes.more')}
          </span>
        </button>
      )}
    </div>
  )
}

export default PalettePicker
