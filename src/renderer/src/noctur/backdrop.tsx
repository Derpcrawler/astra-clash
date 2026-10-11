import React, { useEffect, useRef } from 'react'
import StarfieldWorker from './starfield.worker?worker'

// Noctur window background: drifting glows plus a star field, the stars on Home only (in the Calm
// look both hold still). The stars are
// drawn by noctur/starfield.worker.ts on an OffscreenCanvas, so traffic and connection updates on
// the page's main thread cannot make them stutter. When the user connects from the home page, the
// field plays a jump out of the power button; other code starts it with jumpFrom(element).

const JUMP_EVENT = 'noctur:jump'

export function jumpFrom(el: Element | null): void {
  const r = el?.getBoundingClientRect()
  const detail = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail }))
}

interface Props {
  // Stars at rest. When off, they only appear during the jump.
  stars?: boolean
  // Jump on connect. When off, connecting plays nothing.
  jump?: boolean
  // Home is shown: the Noctur palette's light version paints its twilight sky there.
  home?: boolean
  // The Calm look: the glows stay in place and the stars are drawn once.
  still?: boolean
}

const Backdrop: React.FC<Props> = ({ stars = true, jump = true, home = false, still = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const jumpRef = useRef(jump)
  jumpRef.current = jump

  useEffect(() => {
    workerRef.current?.postMessage({ type: 'opts', showStars: stars, still })
  }, [stars, still])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !('transferControlToOffscreen' in canvas)) return
    // A separate file from the app's own folder: the page's CSP (script-src 'self') blocks blob: workers.
    const worker = new StarfieldWorker()
    workerRef.current = worker
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const size = (): { w: number; h: number; dpr: number } => {
      const r = canvas.getBoundingClientRect()
      return { w: r.width, h: r.height, dpr: Math.min(window.devicePixelRatio || 1, 2) }
    }

    const offscreen = canvas.transferControlToOffscreen()
    worker.postMessage({ type: 'init', canvas: offscreen, ...size() }, [offscreen])
    worker.postMessage({ type: 'opts', showStars: stars, still })

    const sendColors = (): void => {
      const cs = getComputedStyle(document.documentElement)
      const raw = cs.getPropertyValue('--p-tints').trim()
      // The window's base color shows in areas exposed during a resize; match it to the palette.
      const bg = cs.getPropertyValue('--p-bg').trim()
      if (/^#[0-9a-f]{6}$/i.test(bg)) window.electron.ipcRenderer.send('nocturWindowBackground', bg)
      worker.postMessage({
        type: 'colors',
        tints: raw ? raw.split('|').map((v) => v.trim()) : ['255,255,255'],
        accent: cs.getPropertyValue('--p-accent').trim() || '#ffffff'
      })
    }
    sendColors()

    const onJump = (e: Event): void => {
      if (!jumpRef.current) return
      const d = (e as CustomEvent<{ x: number; y: number } | null>).detail
      const r = canvas.getBoundingClientRect()
      const x = d ? d.x - r.left : r.width / 2
      const y = d ? d.y - r.top : r.height / 2
      worker.postMessage({ type: 'jump', x, y, reduceMotion: reduceMotion.matches })
    }
    const onVisibility = (): void => {
      worker.postMessage({ type: 'visible', visible: document.visibilityState === 'visible' })
    }

    const ro = new ResizeObserver(() => worker.postMessage({ type: 'resize', ...size() }))
    ro.observe(canvas)
    const themeObserver = new MutationObserver(sendColors)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-palette'] })
    window.addEventListener('noctur:palette', sendColors)
    window.addEventListener(JUMP_EVENT, onJump)
    document.addEventListener('visibilitychange', onVisibility)
    return (): void => {
      ro.disconnect()
      themeObserver.disconnect()
      window.removeEventListener('noctur:palette', sendColors)
      window.removeEventListener(JUMP_EVENT, onJump)
      document.removeEventListener('visibilitychange', onVisibility)
      worker.terminate()
      workerRef.current = null
    }
    // The canvas can be handed to a worker only once, so this runs once per mount.
  }, [])

  return (
    <div className={`noctur-backdrop${home ? ' home' : ''}${still ? ' still' : ''}`} aria-hidden="true">
      <div className="noctur-sky" />
      <div className="noctur-glow g1" />
      <div className="noctur-glow g2" />
      <div className="noctur-glow g3" />
      <div className="noctur-glow g4" />
      <canvas ref={canvasRef} className="noctur-stars" />
    </div>
  )
}

export default Backdrop
