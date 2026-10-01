// The core's control socket on Linux stays in a folder only this user can open: not a runtime
// folder that is open to others, reached through a symlink, or sits in a folder others can write to
// without the sticky bit (they could rename it away and put their own in its place); not a folder
// that was replaced after an earlier check; not a path too long for a Unix socket (108 bytes). The
// core makes the socket itself writable by everyone, so the folder is the only barrier against
// other users of the machine. Runs the real mihomoIpcPath with Linux settings and real folders.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync } from 'fs'
import { join } from 'path'
import { connect, createServer } from 'net'

const paths = { userData: '' }
// A folder whose path cannot be resolved (as if it vanished between two checks).
const fsFault = vi.hoisted(() => ({ unresolvable: '' }))

vi.mock('fs', async (orig) => {
  const real = await orig<typeof import('fs')>()
  const realpathSync = ((p: string, ...rest: unknown[]) => {
    if (fsFault.unresolvable && p === fsFault.unresolvable) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, realpath '${p}'`), { code: 'ENOENT' })
    }
    return (real.realpathSync as (...a: unknown[]) => string)(p, ...rest)
  }) as typeof real.realpathSync
  return { ...real, realpathSync, default: { ...real, realpathSync } }
})

vi.mock('electron', async () => {
  const stub = await vi.importActual<typeof import('./mocks/electron')>('./mocks/electron')
  return { ...stub, app: { ...stub.app, getPath: (): string => paths.userData } }
})
vi.mock('../src/main/config/app', () => ({ getAppConfigSync: () => ({ core: 'mihomo' }) }))
vi.mock('../src/main/core/manager', () => ({ checkCorePermissionSync: () => true }))

const realPlatform = process.platform
const saved = { runtime: process.env.XDG_RUNTIME_DIR, tmp: process.env.TMPDIR }
let root: string

beforeEach(() => {
  vi.resetModules()
  // A short path with no symlinks above it (macOS's own temp folder starts with the /var symlink).
  root = mkdtempSync(join(realpathSync('/tmp'), 'as-'))
  paths.userData = join(root, 'data')
  mkdirSync(paths.userData, { mode: 0o700 })
  process.env.TMPDIR = join(root, 'tmp')
  mkdirSync(process.env.TMPDIR, { mode: 0o700 })
  delete process.env.XDG_RUNTIME_DIR
  Object.defineProperty(process, 'platform', { value: 'linux' })
})

afterEach(() => {
  fsFault.unresolvable = ''
  Object.defineProperty(process, 'platform', { value: realPlatform })
  for (const [key, value] of [['XDG_RUNTIME_DIR', saved.runtime], ['TMPDIR', saved.tmp]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(root, { recursive: true, force: true })
})

async function socketPath(): Promise<string> {
  const { mihomoIpcPath } = await import('../src/main/utils/dirs')
  return mihomoIpcPath()
}

const fallback = (): string => join(paths.userData, 'run')
const sock = (dir: string): string => join(dir, 'astra-clash-mihomo-api.sock')
function privateDir(p: string): string {
  mkdirSync(p, { recursive: true, mode: 0o700 })
  chmodSync(p, 0o700)
  return p
}

describe('Linux control socket folder', () => {
  it('uses an owner-only runtime folder', async () => {
    process.env.XDG_RUNTIME_DIR = privateDir(join(root, 'runtime'))
    expect(await socketPath()).toBe(sock(process.env.XDG_RUNTIME_DIR))
  })

  it('does not use a runtime folder that others can open', async () => {
    const runtime = join(root, 'public')
    mkdirSync(runtime)
    chmodSync(runtime, 0o777)
    process.env.XDG_RUNTIME_DIR = runtime
    expect(await socketPath()).toBe(sock(fallback()))
    expect(lstatSync(fallback()).mode & 0o777).toBe(0o700)
  })

  it('does not use a runtime folder reached through a symlink', async () => {
    const real = privateDir(join(root, 'real'))
    symlinkSync(real, join(root, 'link'))
    process.env.XDG_RUNTIME_DIR = join(root, 'link')
    expect(await socketPath()).toBe(sock(fallback()))
    // A symlink higher up the path counts too.
    privateDir(join(real, 'inner'))
    process.env.XDG_RUNTIME_DIR = join(root, 'link', 'inner')
    expect(await socketPath()).toBe(sock(fallback()))
  })

  it('does not use a private folder inside a folder others can write to', async () => {
    const shared = join(root, 'shared')
    mkdirSync(shared)
    chmodSync(shared, 0o777)
    process.env.XDG_RUNTIME_DIR = privateDir(join(shared, 'victim'))
    expect(await socketPath()).toBe(sock(fallback()))
  })

  it('accepts a private folder inside a sticky folder, where others cannot rename it', async () => {
    const shared = join(root, 'sticky')
    mkdirSync(shared)
    chmodSync(shared, 0o1777)
    process.env.XDG_RUNTIME_DIR = privateDir(join(shared, 'mine'))
    expect(await socketPath()).toBe(sock(process.env.XDG_RUNTIME_DIR))
  })

  it('checks the folder again on every call, so a replaced folder is not used', async () => {
    const runtime = privateDir(join(root, 'runtime'))
    process.env.XDG_RUNTIME_DIR = runtime
    expect(await socketPath()).toBe(sock(runtime))
    renameSync(runtime, join(root, 'moved'))
    mkdirSync(runtime)
    chmodSync(runtime, 0o777)
    const { mihomoIpcPath } = await import('../src/main/utils/dirs')
    expect(mihomoIpcPath()).toBe(sock(fallback()))
  })

  it('keeps the socket out of the shared /tmp when there is no runtime folder', async () => {
    const p = await socketPath()
    expect(p.startsWith('/tmp/')).toBe(false)
    expect(p).toBe(sock(fallback()))
  })

  it('skips folders whose socket path would be too long and uses a short private one', async () => {
    const long = 'x'.repeat(60)
    process.env.XDG_RUNTIME_DIR = privateDir(join(root, long))
    paths.userData = privateDir(join(root, long, 'data'))
    const p = await socketPath()
    expect(p).toBe(sock(join(process.env.TMPDIR!, `astra-clash-${process.getuid!()}`)))
    expect(Buffer.byteLength(p.replace('api', 'external'))).toBeLessThan(108)
  })

  it('refuses a fallback folder that is a symlink', async () => {
    const elsewhere = privateDir(join(root, 'elsewhere'))
    symlinkSync(elsewhere, fallback())
    process.env.TMPDIR = '/nonexistent-tmp'
    await expect(socketPath()).rejects.toThrow(/No private folder/)
  })

  it('empties its own fallback folder that was open to others instead of reusing what is in it', async () => {
    mkdirSync(fallback())
    chmodSync(fallback(), 0o777)
    const planted = join(fallback(), 'astra-clash-mihomo-api.sock')
    symlinkSync(join(root, 'someone-elses.sock'), planted)
    expect(await socketPath()).toBe(sock(fallback()))
    expect(lstatSync(fallback()).mode & 0o777).toBe(0o700)
    expect(() => lstatSync(planted)).toThrow() // the planted symlink is gone
  })

  it('keeps its own live socket when its folder was opened to others', async () => {
    mkdirSync(fallback(), { mode: 0o700 })
    const live = sock(fallback())
    const server = createServer()
    await new Promise<void>((r) => server.listen(live, r))
    try {
      chmodSync(fallback(), 0o755) // for example chmod -R g+rX by the user while the core runs
      expect(await socketPath()).toBe(live)
      expect(lstatSync(fallback()).mode & 0o777).toBe(0o700)
      await new Promise<void>((resolve, reject) => {
        const c = connect(live, () => (c.end(), resolve()))
        c.on('error', reject)
      })
    } finally {
      await new Promise((r) => server.close(r))
    }
  })

  it('moves on to the next folder when one cannot be resolved', async () => {
    const runtime = privateDir(join(root, 'runtime'))
    process.env.XDG_RUNTIME_DIR = runtime
    fsFault.unresolvable = runtime
    expect(await socketPath()).toBe(sock(fallback()))
  })

  it('names a fix that fits each reason when no folder qualifies', async () => {
    process.env.TMPDIR = '/nonexistent-tmp'
    symlinkSync(join(root, 'elsewhere-missing'), fallback())
    // Runtime folder not set.
    await expect(socketPath()).rejects.toThrow(/XDG_RUNTIME_DIR is not set \(to fix: log in through a desktop session/)
    // Runtime folder set but open to others.
    const open = join(root, 'open')
    mkdirSync(open)
    chmodSync(open, 0o777)
    process.env.XDG_RUNTIME_DIR = open
    await expect(socketPath()).rejects.toThrow(new RegExp(`open to other users \\(to fix: run: chmod 700 "${open}"`))
    // Every folder too long.
    const long = privateDir(join(root, 'x'.repeat(70)))
    process.env.XDG_RUNTIME_DIR = long
    process.env.TMPDIR = long
    await expect(socketPath()).rejects.toThrow(/path too long for a socket \(to fix: set XDG_RUNTIME_DIR or TMPDIR to a shorter folder/)
  })
})
