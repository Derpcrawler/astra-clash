// The package check (build/astra-check-package.cjs) runs after every package build. It rejects an
// app.asar with files outside the app or with private markers, accepts a clean one, and stops when
// the marker list it was given does not exist.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const builder = require.resolve('app-builder-lib', { paths: [require.resolve('electron-builder')] })
const asar = require(require.resolve('@electron/asar', { paths: [builder] }))
const { check } = require('../build/astra-check-package.cjs')

async function pack(files: Record<string, string>): Promise<{ archive: string; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'astra-asar-'))
  const src = join(dir, 'app')
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(src, rel, '..'), { recursive: true })
    writeFileSync(join(src, rel), body)
  }
  const archive = join(dir, 'app.asar')
  await asar.createPackage(src, archive)
  return { archive, dir }
}

const CLEAN = {
  'package.json': '{"name":"astra-clash"}',
  'LICENSE': 'GPL',
  'out/main/index.js': 'console.log(1)',
  'resources/icon.png': 'png',
  'node_modules/x/index.js': 'module.exports = "PRIVATE-MARKER"'
}

describe('package content check', () => {
  it('accepts an archive with only the app files', async () => {
    const { archive, dir } = await pack(CLEAN)
    expect(check(archive, asar, [/PRIVATE-MARKER/])).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects maintainer files at the top level', async () => {
    const { archive, dir } = await pack({ ...CLEAN, 'NOTES.md': '# notes', 'tools/export.sh': 'x', 'design/mockup.html': 'x' })
    const problems = check(archive, asar)
    expect(problems).toEqual(
      expect.arrayContaining([
        'unexpected top-level entry: NOTES.md',
        'unexpected top-level entry: tools',
        'unexpected top-level entry: design'
      ])
    )
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects an internal marker inside the app code', async () => {
    const { archive, dir } = await pack({ ...CLEAN, 'out/main/index.js': '// PRIVATE-MARKER' })
    expect(check(archive, asar, [/PRIVATE-MARKER/])).toEqual(['out/main/index.js contains /PRIVATE-MARKER/'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('stops when ASTRA_PACKAGE_MARKERS names a missing file', async () => {
    const { archive, dir } = await pack(CLEAN)
    process.env.ASTRA_PACKAGE_MARKERS = join(dir, 'no-such-markers.txt')
    try {
      expect(() => check(archive, asar)).toThrow(/does not exist/)
    } finally {
      delete process.env.ASTRA_PACKAGE_MARKERS
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
