// Astra Clash mark, "Orbit through, centered". Geometry on a 24 grid.
const polar = (cx, cy, R, deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)]
const f = (n) => +n.toFixed(3)
export function star(cx, cy, r, k) {
  return `M${f(cx)} ${f(cy - r)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)}Z`
}
export function arc(cx, cy, R, from, to) {
  const [x1, y1] = polar(cx, cy, R, from), [x2, y2] = polar(cx, cy, R, to)
  return `M${f(x1)} ${f(y1)}A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${f(x2)} ${f(y2)}`
}
const [sx, sy] = polar(12, 12, 11.2, -45)
export const stars = star(12, 12, 8.5, 1.2) + star(sx, sy, 2.9, 0.4)
export const arcs = arc(12, 12, 11.2, -150, -61) + arc(12, 12, 11.2, -29, 60)

// Mark as SVG content on the 24 grid. fill and stroke are paint values.
export const markSvg = (paint, strokeWidth) =>
  `<path d="${stars}" fill="${paint}"/><path d="${arcs}" fill="none" stroke="${paint}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`

// App icon, 1024 canvas. macOS: squircle template, 824 px shape at 100 px margin, with a shadow.
// Windows: the same artwork on a rounded square that fills the canvas (32 px margin), no shadow,
// as Windows 11 app icons are drawn.
export function appIconSvg(platform = 'mac') {
  const win = platform === 'win'
  const m = win ? 32 : 100, w = 1024 - 2 * m, rx = win ? 200 : 185
  const s = (527 / 24) * (w / 824), o = 512 - 12 * s
  const dots = [[240,300,4,.75],[330,820,3,.55],[790,760,2.6,.45],[860,420,2.2,.5],[610,880,2,.35],[190,560,2.2,.4],[700,190,3.4,.6],[420,170,1.8,.4],[880,610,1.8,.35],[150,760,1.8,.3],[520,760,1.6,.3]]
    .map(([x, y, r, a]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" fill-opacity="${a}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <radialGradient id="bg" cx="0.3" cy="0.1" r="1.05"><stop offset="0" stop-color="#1e3d73"/><stop offset="0.55" stop-color="#10193a"/><stop offset="1" stop-color="#050812"/></radialGradient>
  <linearGradient id="mk" gradientUnits="userSpaceOnUse" x1="2" y1="22" x2="22" y2="2"><stop offset="0.1" stop-color="#a8d4ff"/><stop offset="0.95" stop-color="#c9b8ff"/></linearGradient>
  <clipPath id="sq"><rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${rx}"/></clipPath>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8fb8ff" stop-opacity="0.32"/><stop offset="1" stop-color="#8fb8ff" stop-opacity="0"/></radialGradient>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.35"/></filter>
</defs>
<g${win ? '' : ' filter="url(#shadow)"'}><rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${rx}" fill="url(#bg)"/></g>
<g clip-path="url(#sq)">${dots}
  <circle cx="512" cy="512" r="${360 * (w / 824)}" fill="url(#halo)"/>
  <g transform="translate(${o} ${o}) scale(${s})">${markSvg('url(#mk)', 1.4)}</g>
</g>
<rect x="${m + 0.5}" y="${m + 0.5}" width="${w - 1}" height="${w - 1}" rx="${rx - 0.5}" fill="none" stroke="#ffffff" stroke-opacity="0.12"/>
</svg>`
}

// Menu bar template image: black on transparent, arcs 1.6 wide. alpha 0.4 for disconnected.
export function traySvg(px, alpha = 1) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><g opacity="${alpha}">${markSvg('#000000', 1.6)}</g></svg>`
}

// Windows notification area icon. Windows shows tray icons in color and does not tint them, so
// connected is the mark in a blue to violet gradient that reads on dark and light taskbars, and
// disconnected is the same mark in gray.
export function trayWinSvg(px, on) {
  const paint = on ? 'url(#tw)' : '#8b919b'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24"><defs><linearGradient id="tw" gradientUnits="userSpaceOnUse" x1="2" y1="22" x2="22" y2="2"><stop offset="0.1" stop-color="#4d9dff"/><stop offset="0.95" stop-color="#9b7bff"/></linearGradient></defs>${markSvg(paint, 1.8)}</svg>`
}
