// Astra Clash star field, drawn in a worker on an OffscreenCanvas. Running off
// the page's main thread keeps it smooth while the page handles traffic and connection updates.

interface Star {
  x: number
  y: number
  z: number
  phase: number
  speed: number
  tint: number
}

type Msg =
  | { type: 'init'; canvas: OffscreenCanvas; w: number; h: number; dpr: number }
  | { type: 'resize'; w: number; h: number; dpr: number }
  | { type: 'colors'; tints: string[]; accent: string }
  | { type: 'opts'; showStars: boolean }
  | { type: 'jump'; x: number; y: number; reduceMotion: boolean }
  | { type: 'visible'; visible: boolean }

const JUMP_SECONDS = 2
const STAR_COUNT = 280

let ctx: OffscreenCanvasRenderingContext2D | null = null
let canvas: OffscreenCanvas | null = null
let w = 0
let h = 0
let tints: string[] = ['255,255,255']
let accent = '#ffffff'
let showStars = true
let restAlpha = 1
let jumpT = -1
let fadeT = -1
let target = { x: 0, y: 0 }
let center: { x: number; y: number } | null = null
let last = 0
let sinceDraw = 0
let visible = true
let scheduled = false

const spawn = (z = 1): Star => ({
  x: (Math.random() * 2 - 1) * 1.3,
  y: (Math.random() * 2 - 1) * 1.3,
  z,
  phase: Math.random() * Math.PI * 2,
  speed: 0.6 + Math.random() * 1.4,
  tint: (Math.random() * 10) | 0
})
const stars: Star[] = Array.from({ length: STAR_COUNT }, () => spawn(Math.random()))

// Stars pull back for 0.25 s, speed up until 1.1 s, hold, then slow down into the resting field.
function jumpSpeed(t: number): number {
  if (t < 0.25) return -0.18
  if (t < 1.1) {
    const e = (t - 0.25) / 0.85
    return 0.02 + 2.6 * e * e
  }
  if (t < 1.25) return 2.62
  const e = Math.min(1, (t - 1.25) / 0.55)
  return 0.02 + 2.6 * Math.pow(1 - e, 3)
}

// Moving the vanishing point would slide every star sideways. Shift each star the opposite way at
// its depth instead, so nothing moves on screen; only the direction of travel changes.
function recenter(n: { x: number; y: number }, k: number): void {
  if (!center) {
    center = { ...n }
    return
  }
  for (const s of stars) {
    s.x += ((center.x - n.x) * s.z) / k
    s.y += ((center.y - n.y) * s.z) / k
  }
  center = { ...n }
}

const raf: (cb: (t: number) => void) => void =
  typeof self.requestAnimationFrame === 'function'
    ? (cb) => self.requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16)

function schedule(): void {
  if (scheduled || !visible) return
  scheduled = true
  raf(frame)
}

function frame(now: number): void {
  scheduled = false
  if (!ctx || !visible) return
  schedule()
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  const active = jumpT >= 0 || fadeT >= 0
  sinceDraw += dt
  if (!active && sinceDraw < 1 / 30) return // 30 fps is enough at rest
  const step = active ? dt : sinceDraw
  sinceDraw = 0

  let v = 0.012
  let flash = 0
  restAlpha += ((showStars ? 1 : 0) - restAlpha) * Math.min(1, step * 4)
  if (jumpT >= 0) {
    jumpT += step
    v = jumpSpeed(jumpT)
    flash = Math.max(0, 1 - Math.abs(jumpT - 1.15) / 0.22) * 0.45
    if (jumpT > JUMP_SECONDS) jumpT = -1
  }
  if (fadeT >= 0) {
    fadeT += step
    flash = Math.max(0, 0.25 - Math.abs(fadeT - 0.15))
    if (fadeT > 0.3) fadeT = -1
  }

  const f = Math.max(w, h) * 0.5
  const k = f * 0.5
  const want = jumpT >= 0 && jumpT < JUMP_SECONDS - 0.1 ? target : { x: w / 2, y: h / 2 }
  if (!center || want.x !== center.x || want.y !== center.y) recenter(want, k)
  const cx = center!.x
  const cy = center!.y
  const fast = v > 0.35
  const time = now / 1000

  ctx.clearRect(0, 0, w, h)
  ctx.lineCap = 'round'
  for (const s of stars) {
    s.z -= v * step
    if (s.z <= 0.04) Object.assign(s, spawn(1))
    if (s.z > 1.35) s.z = 1.35
    const px = cx + (s.x / s.z) * k
    const py = cy + (s.y / s.z) * k
    if (px < -50 || px > w + 50 || py < -50 || py > h + 50) {
      if (v > 0) Object.assign(s, spawn(1))
      continue
    }
    const near = Math.max(0, 1 - s.z)
    const twinkle = 0.7 + 0.3 * Math.sin(time * s.speed + s.phase)
    const shown = jumpT >= 0 ? 1 : restAlpha
    const a = (0.25 + near * 0.75) * (fast ? 1 : twinkle) * shown
    if (a < 0.02) continue
    const tint = tints[s.tint % tints.length]
    if (fast) {
      const z0 = s.z + v * 0.06
      ctx.strokeStyle = near > 0.5 ? `rgba(${tint},${a})` : accent
      ctx.globalAlpha = near > 0.5 ? 1 : a * 0.9
      ctx.lineWidth = 0.6 + near * 1.8
      ctx.beginPath()
      ctx.moveTo(cx + (s.x / z0) * k, cy + (s.y / z0) * k)
      ctx.lineTo(px, py)
      ctx.stroke()
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = `rgba(${tint},${a})`
      ctx.beginPath()
      ctx.arc(px, py, 0.4 + near * 1.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (flash > 0) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
    g.addColorStop(0, accent)
    g.addColorStop(1, 'transparent')
    ctx.globalAlpha = flash
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  }
}

function resize(nw: number, nh: number, dpr: number): void {
  if (!canvas || !ctx) return
  w = nw
  h = nh
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  center = null
}

self.onmessage = (e: MessageEvent<Msg>): void => {
  const m = e.data
  switch (m.type) {
    case 'init':
      canvas = m.canvas
      ctx = canvas.getContext('2d')
      resize(m.w, m.h, m.dpr)
      schedule()
      break
    case 'resize':
      resize(m.w, m.h, m.dpr)
      break
    case 'colors':
      tints = m.tints.length ? m.tints : ['255,255,255']
      accent = m.accent
      break
    case 'opts':
      showStars = m.showStars
      break
    case 'jump':
      target = { x: m.x, y: m.y }
      if (m.reduceMotion) fadeT = 0
      else jumpT = 0
      break
    case 'visible':
      visible = m.visible
      last = 0
      schedule()
      break
  }
}
