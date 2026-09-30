/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Astra Clash: afterPack check of what went into app.asar. Fails the build when the archive holds
// anything outside the allowed top-level entries, or when a file in it matches one of the private
// markers listed in internal/package-markers.txt (one regular expression per line). That list stays
// in the working repo; without it only the top-level check runs. Runs for every platform before
// signing.
const fs = require('fs')
const path = require('path')

const ALLOWED_TOP = new Set(['out', 'resources', 'node_modules', 'package.json', 'LICENSE'])

function loadMarkers() {
  const file = path.join(__dirname, '..', 'internal', 'package-markers.txt')
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => new RegExp(l))
}

function loadAsar() {
  // @electron/asar comes with electron-builder; pnpm does not hoist it to the project root.
  const builder = require.resolve('app-builder-lib', { paths: [require.resolve('electron-builder')] })
  return require(require.resolve('@electron/asar', { paths: [builder] }))
}

function asarPath(context) {
  const name = context.packager.appInfo.productFilename
  return context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${name}.app`, 'Contents', 'Resources', 'app.asar')
    : path.join(context.appOutDir, 'resources', 'app.asar')
}

function check(archive, asar, markers = loadMarkers()) {
  const entries = asar.listPackage(archive)
  const problems = []
  for (const top of new Set(entries.map((p) => p.split(/[\\/]/)[1]).filter(Boolean))) {
    if (!ALLOWED_TOP.has(top)) problems.push(`unexpected top-level entry: ${top}`)
  }
  // Markers are checked in the app's own files; node_modules are third-party code.
  if (!markers.length) return problems
  for (const entry of entries) {
    const rel = entry.replace(/^[\\/]/, '')
    if (!/^(out|resources)[\\/].+\.(js|mjs|cjs|html|css|json|txt|md)$/.test(rel)) continue
    let text
    try {
      text = asar.extractFile(archive, rel).toString('utf8')
    } catch {
      continue // a directory
    }
    for (const m of markers) if (m.test(text)) problems.push(`${rel} contains ${m}`)
  }
  return problems
}

exports.check = check
exports.default = async function (context) {
  const archive = asarPath(context)
  const problems = check(archive, loadAsar())
  if (problems.length) {
    throw new Error(`app.asar holds files that must not ship:\n  ${problems.join('\n  ')}`)
  }
  console.log(`  • app.asar contents checked (${path.basename(context.appOutDir)})`)
}
