import React, { useId } from 'react'

// The Astra Clash mark, "Orbit through, centered", drawn on a 24 grid.
// Same geometry as design/mark.mjs. Colors come from the active palette.

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + r * Math.cos((deg * Math.PI) / 180),
  cy + r * Math.sin((deg * Math.PI) / 180)
]
const star = (cx: number, cy: number, r: number, k: number): string =>
  `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`
const arc = (cx: number, cy: number, r: number, from: number, to: number): string => {
  const [x1, y1] = polar(cx, cy, r, from)
  const [x2, y2] = polar(cx, cy, r, to)
  return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`
}
const [sx, sy] = polar(12, 12, 11.2, -45)
const STARS = star(12, 12, 8.5, 1.2) + star(sx, sy, 2.9, 0.4)
const ARCS = arc(12, 12, 11.2, -150, -61) + arc(12, 12, 11.2, -29, 60)

const Mark: React.FC<{ className?: string }> = ({ className }) => {
  const id = useId()
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="2" y1="22" x2="22" y2="2">
          <stop offset="0.1" style={{ stopColor: 'var(--p-accent, currentColor)' }} />
          <stop offset="0.95" style={{ stopColor: 'var(--p-accent2, currentColor)' }} />
        </linearGradient>
      </defs>
      <path d={STARS} fill={`url(#${id})`} />
      <path d={ARCS} fill="none" stroke={`url(#${id})`} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export default Mark
