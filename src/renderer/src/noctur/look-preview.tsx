import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Power } from 'lucide-react'
import { Spinner } from '@renderer/components/ui/spinner'
import Eclipse, { EclipseState } from './eclipse'
import { Palette, paletteVars } from './palettes'

// The two looks, Noctur and Calm, each shown as a small Home that connects and disconnects in a
// loop of about four seconds. Used by the first-launch picker (look-picker.tsx) and in Settings,
// Appearance. The clips are drawn live, so they follow the theme and palette in use; they play only
// while on screen (in Settings only under the pointer) and hold the connected state with reduced
// motion or when not playing.

export type Look = 'noctur' | 'calm'

// [state, seconds held]
const STEPS: Record<Look, [EclipseState, number][]> = {
  noctur: [
    ['off', 0.5],
    ['connecting', 0.6],
    ['on', 2.3],
    ['off', 0.8]
  ],
  calm: [
    ['off', 0.9],
    ['connecting', 0.5],
    ['on', 1.7],
    ['off', 0.6]
  ]
}

const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// A small star field on the page's thread (the window's own runs in a worker): it drifts and
// twinkles for Noctur and is drawn once for Calm. Tints default to the palette in use.
const MiniStars: React.FC<{ still: boolean; playing: boolean; tints?: string[] }> = ({
  still,
  playing,
  tints: ownTints
}) => {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return undefined
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--p-tints').trim()
    const tints = ownTints ?? (raw ? raw.split('|').map((v) => v.trim()) : ['255,255,255'])
    const spawn = (z: number): { x: number; y: number; z: number; phase: number; speed: number; tint: number } => ({
      x: (Math.random() * 2 - 1) * 1.3,
      y: (Math.random() * 2 - 1) * 1.3,
      z,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.4,
      tint: (Math.random() * 10) | 0
    })
    const stars = Array.from({ length: 90 }, () => spawn(0.15 + Math.random() * 0.85))
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const moving = !still && playing && !reduceMotion()
    const draw = (now: number, step: number): void => {
      const k = Math.max(w, h) * 0.25
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        if (moving) {
          s.z -= 0.012 * step
          if (s.z <= 0.04) Object.assign(s, spawn(1))
        }
        const px = w / 2 + (s.x / s.z) * k
        const py = h / 2 + (s.y / s.z) * k
        if (px < -20 || px > w + 20 || py < -20 || py > h + 20) {
          if (moving) Object.assign(s, spawn(1))
          continue
        }
        const near = Math.max(0, 1 - s.z)
        const twinkle = moving ? 0.7 + 0.3 * Math.sin((now / 1000) * s.speed + s.phase) : 0.85
        ctx.fillStyle = `rgba(${tints[s.tint % tints.length]},${(0.25 + near * 0.75) * twinkle})`
        ctx.beginPath()
        ctx.arc(px, py, (0.4 + near * 1.3) * 0.75, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    draw(performance.now(), 0)
    if (!moving) return undefined
    let raf = 0
    let last = 0
    let since = 0
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      since += Math.min(0.05, (now - (last || now)) / 1000)
      last = now
      if (since < 1 / 30) return
      draw(now, since)
      since = 0
    }
    raf = requestAnimationFrame(loop)
    return (): void => cancelAnimationFrame(raf)
  }, [still, playing, ownTints])
  return <canvas ref={ref} className="noctur-stars" />
}

/**
 * One look as a small Home. With `palette`, it is drawn in that palette instead of the one in use
 * (the palette tiles in Settings); a palette without a light version is drawn dark.
 */
export const LookPreview: React.FC<{ look: Look; light: boolean; play?: boolean; palette?: Palette }> = ({
  look,
  light: lightTheme,
  play = true,
  palette
}) => {
  const light = lightTheme && (!palette || !!palette.light)
  const tokens = palette ? (light && palette.light ? palette.light : palette.dark) : null
  const scoped = tokens
    ? (Object.fromEntries(paletteVars(tokens, !light)) as React.CSSProperties)
    : undefined
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<EclipseState>('off')

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const io = new IntersectionObserver((e) => setVisible(e[0].isIntersecting))
    io.observe(el)
    return (): void => io.disconnect()
  }, [])

  useEffect(() => {
    if (reduceMotion() || !play) {
      setState('on')
      return undefined
    }
    if (!visible) return undefined
    let i = 0
    let timer = 0
    const next = (): void => {
      const [s, secs] = STEPS[look][i]
      setState(s)
      i = (i + 1) % STEPS[look].length
      timer = window.setTimeout(next, secs * 1000)
    }
    next()
    return (): void => clearTimeout(timer)
  }, [look, visible, play])

  const label =
    state === 'on'
      ? t('pages.home.connected')
      : state === 'connecting'
        ? t('pages.home.connecting')
        : t('pages.home.disconnected')

  return (
    <div
      ref={ref}
      className={`noctur-look-clip${look === 'calm' ? ' still' : ''}`}
      data-palette-preview={palette?.id}
      data-twilight={palette ? String(light && palette.id === 'noctur') : undefined}
      style={scoped}
      aria-hidden="true"
    >
      <div className="noctur-look-sky" />
      <div className="noctur-glow g1" />
      <div className="noctur-glow g2" />
      <div className="noctur-glow g3" />
      <div className="noctur-glow g4" />
      <MiniStars still={look === 'calm' || !play} playing={visible && play} tints={tokens?.tints} />
      <div className="noctur-look-side">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="noctur-look-center">
        {look === 'calm' ? (
          <span className={`noctur-power sm${state !== 'off' ? ' on' : ''}${state === 'connecting' ? ' busy' : ''}`}>
            {state === 'connecting' ? <Spinner className="size-5" /> : <Power className="size-5" strokeWidth={2.2} />}
          </span>
        ) : (
          <Eclipse
            className="noctur-look-eclipse"
            state={state}
            moon={light ? 'day' : 'earthshine'}
            light={light}
          />
        )}
        <span className="noctur-look-state">{label}</span>
        {look === 'noctur' && (
          <span className={`noctur-look-btn${state !== 'off' ? ' on' : ''}`}>
            {state === 'on' ? t('noctur.home.disconnect') : t('noctur.home.connect')}
          </span>
        )}
      </div>
    </div>
  )
}

// Settings, Appearance: a tile like the palette tiles, with the description as its tooltip. At rest
// the clip shows the look connected; it plays while the pointer is over the tile or it has focus.
const LookTile: React.FC<{ look: Look; light: boolean; selected: boolean; onPick: () => void }> = ({
  look,
  light,
  selected,
  onPick
}) => {
  const { t } = useTranslation()
  const [active, setActive] = useState(false)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={t(`noctur.look.${look}Desc`)}
      onClick={onPick}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      className="noctur-palette-tile noctur-look-tile"
    >
      <LookPreview look={look} light={light} play={active} />
      <span className="noctur-palette-name">{t(`noctur.look.${look}`)}</span>
    </button>
  )
}

/**
 * The two looks as a radio group: cards with a looping clip, name and description (the
 * first-launch picker), or compact tiles (Settings).
 */
export const LookChoices: React.FC<{
  value: Look
  light: boolean
  onChange: (look: Look) => void
  compact?: boolean
}> = ({ value, light, onChange, compact = false }) => {
  const { t } = useTranslation()
  const looks: Look[] = ['noctur', 'calm']
  if (compact) {
    return (
      <div role="radiogroup" aria-label={t('noctur.look.title')} className="noctur-look-tiles">
        {looks.map((look) => (
          <LookTile key={look} look={look} light={light} selected={value === look} onPick={() => onChange(look)} />
        ))}
      </div>
    )
  }
  return (
    <div role="radiogroup" aria-label={t('noctur.look.title')} className="noctur-looks">
      {looks.map((look) => (
        <button
          key={look}
          type="button"
          role="radio"
          aria-checked={value === look}
          onClick={() => onChange(look)}
          className="noctur-look"
        >
          <LookPreview look={look} light={light} />
          <span className="noctur-look-text">
            <span className="noctur-look-name">
              <span className="noctur-look-radio" />
              {t(`noctur.look.${look}`)}
            </span>
            <span className="noctur-look-desc">{t(`noctur.look.${look}Desc`)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
