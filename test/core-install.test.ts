// The administrator step of the core download: the file is copied once into protected staging and
// that copy's SHA-256 is checked before it is installed, so a file swapped after the app's check is
// refused. These tests run the real script with sh (and once through osascript) against throwaway
// folders, without root: owners are left alone, everything else is the production script.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'
import { INSTALL_EXIT, installScript, osascriptArgs } from '../src/main/astra/core-install'

const execFileP = promisify(execFile)
const sha = (b: string): string => createHash('sha256').update(b).digest('hex')

let root: string
let coreDir: string
let source: string
const NAME = 'mihomo-v1.19.99'
const GOOD = '#!/bin/sh\necho "Mihomo Meta v1.19.99"\n'

function plan(sha256 = sha(GOOD)): Parameters<typeof installScript>[0] {
  return { source, sha256, coreDir, name: NAME, dirOwner: null, fileOwner: null, mode: '4755' }
}

async function run(script: string): Promise<number> {
  try {
    await execFileP('/bin/sh', ['-c', script])
    return 0
  } catch (e) {
    return (e as { code: number }).code
  }
}

const target = (): string => join(coreDir, NAME)
const stagingLeft = (): string[] => (existsSync(coreDir) ? readdirSync(coreDir).filter((f) => f.startsWith('.staging')) : [])

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'astra core '))
  coreDir = join(root, 'Astra Clash', 'cores')
  mkdirSync(join(root, 'Astra Clash'))
  source = join(root, 'user tmp', 'mihomo')
  mkdirSync(join(root, 'user tmp'))
  writeFileSync(source, GOOD)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('core install script', () => {
  it('installs the checked file with the setuid mode', async () => {
    expect(await run(installScript(plan()))).toBe(0)
    expect(readFileSync(target(), 'utf8')).toBe(GOOD)
    expect(statSync(target()).mode & 0o7777).toBe(0o4755)
    expect(stagingLeft()).toEqual([])
  })

  it('refuses a file swapped after the check and keeps the previous core', async () => {
    mkdirSync(coreDir, { recursive: true })
    writeFileSync(target(), 'previous core')
    const script = installScript(plan()) // digest taken from the checked bytes
    writeFileSync(source, '#!/bin/sh\necho swapped\n') // swap during the password prompt
    expect(await run(script)).toBe(INSTALL_EXIT.digestMismatch)
    expect(readFileSync(target(), 'utf8')).toBe('previous core')
    expect(stagingLeft()).toEqual([])
  })

  it('refuses when the source was replaced by a symlink to another file', async () => {
    rmSync(source)
    const other = join(root, 'other')
    writeFileSync(other, 'not the core')
    symlinkSync(other, source)
    expect(await run(installScript(plan()))).toBe(INSTALL_EXIT.digestMismatch)
    expect(existsSync(target())).toBe(false)
  })

  it('refuses a symlink at the target path', async () => {
    mkdirSync(coreDir, { recursive: true })
    const elsewhere = join(root, 'elsewhere')
    writeFileSync(elsewhere, 'untouched')
    symlinkSync(elsewhere, target())
    expect(await run(installScript(plan()))).toBe(INSTALL_EXIT.unsafePath)
    expect(lstatSync(target()).isSymbolicLink()).toBe(true)
    expect(readFileSync(elsewhere, 'utf8')).toBe('untouched')
  })

  it('refuses a core folder that is a symlink', async () => {
    const real = join(root, 'real cores')
    mkdirSync(real)
    symlinkSync(real, coreDir)
    expect(await run(installScript(plan()))).toBe(INSTALL_EXIT.unsafePath)
    expect(readdirSync(real)).toEqual([])
  })

  it('runs two installs at once without sharing staging', async () => {
    const codes = await Promise.all([run(installScript(plan())), run(installScript(plan()))])
    expect(codes).toEqual([0, 0])
    expect(readFileSync(target(), 'utf8')).toBe(GOOD)
    expect(stagingLeft()).toEqual([])
  })

  it('rejects bad input before building a script', () => {
    expect(() => installScript(plan('abc'))).toThrow()
    expect(() => installScript({ ...plan(), name: "mihomo-v1'; rm -rf /" })).toThrow()
  })

  it.runIf(process.platform === 'darwin')('gives the same result through osascript, as the app runs it', async () => {
    await execFileP('/usr/bin/osascript', osascriptArgs(installScript(plan()), false))
    expect(readFileSync(target(), 'utf8')).toBe(GOOD)
    expect(statSync(target()).mode & 0o7777).toBe(0o4755)
  })
})
