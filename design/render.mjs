// Renders the icon SVGs to PNG with headless Chrome and builds the .icns and .ico files.
// Run: node design/render.mjs
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'
import { appIconSvg, traySvg, trayWinSvg } from './mark.mjs'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const tmp = path.join(root, 'design', '.render')
mkdirSync(tmp, { recursive: true })
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
function png(svg, size, out) {
  const html = path.join(tmp, 'page.html')
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`)
  execFileSync(chrome, ['--headless=new', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${size}`, '--force-device-scale-factor=1', `--screenshot=${out}`, `file://${html}`], { stdio: 'ignore' })
}
writeFileSync(path.join(root, 'design', 'app-icon.svg'), appIconSvg())
const master = path.join(root, 'design', 'app-icon-1024.png')
png(appIconSvg(), 1024, master)
const iconset = path.join(tmp, 'icon.iconset')
rmSync(iconset, { recursive: true, force: true }); mkdirSync(iconset)
for (const s of [16, 32, 128, 256, 512]) {
  execFileSync('sips', ['-z', `${s}`, `${s}`, master, '--out', path.join(iconset, `icon_${s}x${s}.png`)], { stdio: 'ignore' })
  execFileSync('sips', ['-z', `${s * 2}`, `${s * 2}`, master, '--out', path.join(iconset, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' })
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build', 'icon.icns')])
execFileSync('sips', ['-z', '512', '512', master, '--out', path.join(root, 'build', 'icon.png')], { stdio: 'ignore' })
execFileSync('sips', ['-z', '512', '512', master, '--out', path.join(root, 'resources', 'icon.png')], { stdio: 'ignore' })
// Tray sources at 64 px; tray.ts builds 16 px and 32 px representations from them.
png(traySvg(64, 1), 64, path.join(root, 'resources', 'icon_on_mac.png'))
png(traySvg(64, 0.4), 64, path.join(root, 'resources', 'icon_off_mac.png'))
writeFileSync(path.join(root, 'design', 'tray.svg'), traySvg(64, 1))

// Windows .ico: one PNG per size (Windows Vista and later read PNG entries), downscaled with sips
// from a large render so small sizes stay smooth.
function ico(bigPng, sizes, out) {
  const pngs = sizes.map((z) => {
    const p = path.join(tmp, `ico-${z}.png`)
    execFileSync('sips', ['-z', `${z}`, `${z}`, bigPng, '--out', p], { stdio: 'ignore' })
    return readFileSync(p)
  })
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4)
  let offset = head.length
  pngs.forEach((data, i) => {
    const e = 6 + 16 * i, z = sizes[i]
    head.writeUInt8(z >= 256 ? 0 : z, e); head.writeUInt8(z >= 256 ? 0 : z, e + 1)
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  writeFileSync(out, Buffer.concat([head, ...pngs]))
}
const winMaster = path.join(tmp, 'win-1024.png')
png(appIconSvg('win'), 1024, winMaster)
const appSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
ico(winMaster, appSizes, path.join(root, 'build', 'icon.ico'))
ico(winMaster, appSizes, path.join(root, 'build', 'installerIcon.ico'))
// Tray: 16 px at 100% scaling up to 32 px at 200%.
const traySizes = [16, 20, 24, 32, 40, 48, 64]
png(trayWinSvg(256, true), 256, path.join(tmp, 'tray-on.png'))
png(trayWinSvg(256, false), 256, path.join(tmp, 'tray-off.png'))
ico(path.join(tmp, 'tray-on.png'), traySizes, path.join(root, 'resources', 'icon.ico'))
ico(path.join(tmp, 'tray-off.png'), traySizes, path.join(root, 'resources', 'icon_off.ico'))
writeFileSync(path.join(root, 'design', 'app-icon-win.svg'), appIconSvg('win'))
rmSync(tmp, { recursive: true, force: true })
console.log('icons written')
