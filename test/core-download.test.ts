// The core download: one download at a time, a cancelled password prompt leaves no temporary files
// and keeps the current core, and GitHub requests go through the local proxy only while the core
// listens on it. Network, config and osascript are replaced; the downloaded "core" is a shell
// script that prints a version, and it runs for real for the version check.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'
import { gzipSync } from 'zlib'
import { existsSync, mkdtempSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'

const TAG = 'v1.19.99'
const CORE = `#!/bin/sh\necho "Mihomo Meta ${TAG} darwin"\n`
const GZ = gzipSync(Buffer.from(CORE))
const state = vi.hoisted(() => ({
  dataDir: '',
  admin: [] as string[],
  adminResult: 'cancel' as 'cancel' | 'ok',
  releaseGate: null as null | Promise<void>,
  patches: [] as unknown[],
  coreRunning: true,
  runtimePort: 0,
  gets: [] as { url: string; proxy: unknown }[],
  proxyError: '' as string
}))

vi.mock('../src/main/utils/dirs', () => ({
  ASTRA_CORE_DIR: '/nonexistent/Astra Clash/cores',
  dataDir: () => state.dataDir,
  mihomoCoreDir: () => '/nonexistent'
}))
vi.mock('../src/main/config', () => ({
  getAppConfig: async () => ({}),
  getControledMihomoConfig: async () => ({ 'mixed-port': 7897 }), // the saved port
  patchAppConfig: async (p: unknown) => {
    state.patches.push(p)
  }
}))
vi.mock('../src/main/core/manager', () => ({ restartCore: async () => {}, hasCoreProcess: () => state.coreRunning }))
vi.mock('../src/main/core/factory', () => ({ getRuntimeConfig: async () => ({ 'mixed-port': state.runtimePort }) }))
vi.mock('axios', () => ({
  default: {
    get: async (url: string, cfg: { proxy?: unknown } = {}) => {
      state.gets.push({ url, proxy: cfg.proxy })
      if (cfg.proxy && state.proxyError) throw Object.assign(new Error(state.proxyError), { code: state.proxyError })
      if (url.includes('api.github.com')) {
        if (state.releaseGate) await state.releaseGate
        const arch = process.arch === 'arm64' ? 'arm64' : 'amd64-v1'
        return {
          data: {
            tag_name: TAG,
            assets: [
              {
                name: `mihomo-darwin-${arch}-${TAG}.gz`,
                browser_download_url: 'https://example.invalid/core.gz',
                digest: `sha256:${createHash('sha256').update(GZ).digest('hex')}`,
                size: GZ.length
              }
            ]
          }
        }
      }
      return { data: GZ }
    }
  }
}))
vi.mock('child_process', async (orig) => {
  const real = await orig<typeof import('child_process')>()
  const execFile = (file: string, args: string[], opts: unknown, cb?: unknown): void => {
    const done = (typeof opts === 'function' ? opts : cb) as (e: Error | null, out?: string, err?: string) => void
    if (file === 'osascript') {
      state.admin.push(args[1])
      if (state.adminResult === 'cancel') {
        const e = Object.assign(new Error('execution error: User canceled. (-128)'), { stderr: 'User canceled. (-128)' })
        done(e)
      } else done(null, '', '')
      return
    }
    real.execFile(file, args, opts as object, done as never)
  }
  ;(execFile as unknown as Record<symbol, unknown>)[promisify.custom] = (file: string, args: string[], opts?: unknown) =>
    new Promise((resolve, reject) =>
      execFile(file, args, opts ?? {}, (e: Error | null, stdout?: string, stderr?: string) => (e ? reject(e) : resolve({ stdout, stderr })))
    )
  return { ...real, execFile }
})

const { downloadCore, latestCore } = await import('../src/main/astra/core-download')

beforeEach(() => {
  state.dataDir = mkdtempSync(join(tmpdir(), 'astra-data-'))
  state.admin = []
  state.patches = []
  state.releaseGate = null
  state.coreRunning = true
  state.runtimePort = 0
  state.gets = []
  state.proxyError = ''
})

describe('downloadCore', () => {
  it('refuses a second download while one is running', async () => {
    let open!: () => void
    state.releaseGate = new Promise((r) => (open = r))
    state.adminResult = 'ok'
    const first = downloadCore()
    await expect(downloadCore()).rejects.toThrow('already running')
    open()
    await expect(first).resolves.toBe(TAG)
    // The admin script checks the digest of the decompressed core, not of the download.
    expect(state.admin[0]).toContain(createHash('sha256').update(CORE).digest('hex'))
  })

  it('cleans up and keeps the config when the password prompt is cancelled', async () => {
    state.adminResult = 'cancel'
    await expect(downloadCore()).rejects.toThrow()
    expect(state.patches).toEqual([])
    const tmp = join(state.dataDir, 'tmp')
    expect(existsSync(tmp) ? readdirSync(tmp) : []).toEqual([])
    // A later attempt is not blocked by the cancelled one.
    state.adminResult = 'ok'
    await expect(downloadCore()).resolves.toBe(TAG)
  })
})

describe('GitHub requests', () => {
  const proxyOf = (): unknown[] => state.gets.map((g) => g.proxy)

  it('go direct while disconnected, although the saved mixed-port is set', async () => {
    state.runtimePort = 0 // the core runs without listeners
    await latestCore()
    expect(proxyOf()).toEqual([undefined])
  })

  it('go direct when the core is not running', async () => {
    state.coreRunning = false
    state.runtimePort = 7897
    await latestCore()
    expect(proxyOf()).toEqual([undefined])
  })

  it('go through the local listener when connected', async () => {
    state.runtimePort = 7897
    await latestCore()
    expect(proxyOf()).toEqual([{ protocol: 'http', host: '127.0.0.1', port: 7897 }])
  })

  it('retry once directly when the local listener refuses the connection', async () => {
    state.runtimePort = 7897
    state.proxyError = 'ECONNREFUSED'
    await latestCore()
    expect(proxyOf()).toEqual([{ protocol: 'http', host: '127.0.0.1', port: 7897 }, undefined])
  })

  it('report other errors without a direct retry', async () => {
    state.runtimePort = 7897
    state.proxyError = 'ETIMEDOUT'
    await expect(latestCore()).rejects.toThrow('ETIMEDOUT')
    expect(state.gets).toHaveLength(1)
  })
})
