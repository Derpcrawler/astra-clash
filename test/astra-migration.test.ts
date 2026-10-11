// The app was called Astra Clash before. On the first start of Noctur, Astra Clash's data folder
// (settings, profiles, rules) moves into Noctur's, without replacing anything Noctur already has.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { moveOldDataDir, RECORD } from '../src/main/noctur/migrate-astra'

let root: string, oldDir: string, newDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'noctur-migrate-'))
  oldDir = join(root, 'astra-clash')
  newDir = join(root, 'noctur')
  mkdirSync(join(oldDir, 'profiles'), { recursive: true })
  writeFileSync(join(oldDir, 'config.yaml'), 'palette: pleiades\n')
  writeFileSync(join(oldDir, 'profile.yaml'), 'current: abc\n')
  writeFileSync(join(oldDir, 'profiles', 'abc.yaml'), 'proxies: []\n')
})

afterEach(() => {
  if (existsSync(join(oldDir, 'profiles'))) chmodSync(join(oldDir, 'profiles'), 0o755)
  rmSync(root, { recursive: true, force: true })
})

describe('moving Astra Clash data', () => {
  it('moves settings and profiles into a new Noctur data folder', () => {
    moveOldDataDir(oldDir, newDir)
    expect(readFileSync(join(newDir, 'config.yaml'), 'utf8')).toBe('palette: pleiades\n')
    expect(readFileSync(join(newDir, 'profiles', 'abc.yaml'), 'utf8')).toBe('proxies: []\n')
    expect(existsSync(oldDir)).toBe(false)
  })

  it('leaves both folders alone when Noctur already has settings', () => {
    mkdirSync(newDir)
    writeFileSync(join(newDir, 'config.yaml'), 'palette: orion\n')
    expect(moveOldDataDir(oldDir, newDir)).toBeNull()
    expect(readFileSync(join(newDir, 'config.yaml'), 'utf8')).toBe('palette: orion\n')
    expect(existsSync(join(oldDir, 'profiles', 'abc.yaml'))).toBe(true)
  })

  it('keeps an entry Noctur already has and still moves the settings', () => {
    mkdirSync(newDir)
    writeFileSync(join(newDir, 'profile.yaml'), 'current: noctur\n')
    const result = moveOldDataDir(oldDir, newDir)
    expect(readFileSync(join(newDir, 'profile.yaml'), 'utf8')).toBe('current: noctur\n')
    expect(readFileSync(join(newDir, 'config.yaml'), 'utf8')).toBe('palette: pleiades\n')
    expect(result?.kept).toEqual(['profile.yaml'])
    expect(readFileSync(join(oldDir, 'profile.yaml'), 'utf8')).toBe('current: abc\n')
  })

  // A folder that cannot be moved (here: no write permission on it, which renaming a folder into
  // another parent needs) must not leave the settings split, and Noctur must not run with defaults
  // in its own folder meanwhile: what moved goes back, the old folder is used, and a profile added
  // in that start moves with the rest later.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'puts everything back when an entry fails, and moves it all on a later start',
    () => {
      chmodSync(join(oldDir, 'profiles'), 0o500)
      const first = moveOldDataDir(oldDir, newDir)
      expect(first?.useOldDir).toBe(true)
      expect(first?.failed).toEqual(['profiles'])
      expect(readFileSync(join(oldDir, 'profile.yaml'), 'utf8')).toBe('current: abc\n')
      expect(readdirSync(newDir).filter((e) => !e.startsWith('.'))).toEqual([])

      // That start works on the old folder: the user adds a profile.
      chmodSync(join(oldDir, 'profiles'), 0o755)
      writeFileSync(join(oldDir, 'profiles', 'new.yaml'), 'proxies: [new]\n')
      writeFileSync(join(oldDir, 'profile.yaml'), 'current: new\n')

      const second = moveOldDataDir(oldDir, newDir)
      expect(second?.useOldDir).toBe(false)
      expect(readFileSync(join(newDir, 'config.yaml'), 'utf8')).toBe('palette: pleiades\n')
      expect(readFileSync(join(newDir, 'profile.yaml'), 'utf8')).toBe('current: new\n')
      expect(readFileSync(join(newDir, 'profiles', 'new.yaml'), 'utf8')).toBe('proxies: [new]\n')
      expect(readFileSync(join(newDir, 'profiles', 'abc.yaml'), 'utf8')).toBe('proxies: []\n')
      expect(existsSync(join(newDir, RECORD))).toBe(false)
      expect(existsSync(oldDir)).toBe(false)
    }
  )

  // A damaged record of an unfinished move (here: cut off) must not be read as "no move under way":
  // what moved before is put back when the move fails again.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'continues an unfinished move whose record is damaged',
    () => {
      mkdirSync(newDir, { mode: 0o700 })
      renameSync(join(oldDir, 'profile.yaml'), join(newDir, 'profile.yaml'))
      writeFileSync(join(newDir, RECORD), '{"noct')
      chmodSync(join(oldDir, 'profiles'), 0o500)
      const result = moveOldDataDir(oldDir, newDir)
      expect(result?.useOldDir).toBe(true)
      expect(readFileSync(join(oldDir, 'profile.yaml'), 'utf8')).toBe('current: abc\n')
      expect(existsSync(join(newDir, 'profile.yaml'))).toBe(false)
    }
  )

  it.skipIf(process.platform === 'win32')('does not move over a link Noctur already has, even a broken one', () => {
    mkdirSync(newDir)
    symlinkSync(join(root, 'missing'), join(newDir, 'profile.yaml'))
    const result = moveOldDataDir(oldDir, newDir)
    expect(result?.kept).toEqual(['profile.yaml'])
    expect(lstatSync(join(newDir, 'profile.yaml')).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(oldDir, 'profile.yaml'), 'utf8')).toBe('current: abc\n')
  })

  it.skipIf(process.platform === 'win32')('closes the Noctur folder to others before moving into it', () => {
    const mask = process.umask(0o022)
    try {
      moveOldDataDir(oldDir, newDir)
    } finally {
      process.umask(mask)
    }
    expect(statSync(newDir).mode & 0o777).toBe(0o700)

    rmSync(newDir, { recursive: true })
    mkdirSync(join(oldDir, 'profiles'), { recursive: true })
    writeFileSync(join(oldDir, 'config.yaml'), 'palette: pleiades\n')
    mkdirSync(newDir, { mode: 0o755 })
    chmodSync(newDir, 0o755)
    moveOldDataDir(oldDir, newDir)
    expect(statSync(newDir).mode & 0o777).toBe(0o700)
  })

  it.skipIf(process.platform === 'win32')('refuses a Noctur folder that is a link and moves nothing', () => {
    const elsewhere = join(root, 'elsewhere')
    mkdirSync(elsewhere)
    symlinkSync(elsewhere, newDir)
    const result = moveOldDataDir(oldDir, newDir)
    expect(result?.error).toBeTruthy()
    expect(readdirSync(elsewhere)).toEqual([])
    expect(readlinkSync(newDir)).toBe(elsewhere)
    expect(existsSync(join(oldDir, 'config.yaml'))).toBe(true)
  })
})
