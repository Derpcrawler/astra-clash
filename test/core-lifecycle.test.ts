// The core lifecycle through the production callers: the real startCore, stopCore and
// mihomoHotReloadConfig run against a fake core process whose stdout the test writes. Startup
// settles for a silent core, a spawn error and an exit. After each successful hot reload the window
// is told to refresh groups and rules once that reload's providers have started, and a failed
// reload announces nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

class FakeCore extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  pid = 4242
  exitCode: number | null = null
  signalCode: string | null = null
  killed = false
  kill(signal = 'SIGTERM'): boolean {
    this.killed = true
    setImmediate(() => {
      this.signalCode = signal
      this.emit('exit', null, signal)
      this.emit('close', null, signal)
    })
    return true
  }
  unref(): void {
    // nothing to detach in tests
  }
}

const s = vi.hoisted(() => ({
  dir: '',
  cores: [] as unknown[],
  sent: [] as string[],
  errors: [] as string[],
  puts: [] as string[],
  putFails: false,
  holdPuts: false,
  heldPuts: [] as { resolve: () => void; reject: (e: Error) => void }[],
  apiUp: true,
  runtime: {} as Record<string, unknown>
}))

vi.mock('child_process', async (orig) => {
  const real = await orig<typeof import('child_process')>()
  return {
    ...real,
    spawn: () => {
      const core = new FakeCore()
      s.cores.push(core)
      return core
    }
  }
})
vi.mock('../src/main/index', () => ({
  mainWindow: { webContents: { send: (ch: string) => s.sent.push(ch) } },
  showError: (title: string) => {
    s.errors.push(title)
  }
}))
vi.mock('../src/main/config', () => ({
  getAppConfig: async () => ({}),
  getControledMihomoConfig: async () => ({ tun: { enable: false } }),
  getProfileConfig: async () => ({ current: 'p1' }),
  patchAppConfig: async () => {},
  patchControledMihomoConfig: async () => {}
}))
vi.mock('../src/main/core/factory', () => ({
  generateProfile: async () => ({ logLevel: 'info' }),
  getRuntimeConfig: async () => s.runtime
}))
vi.mock('../src/main/utils/dirs', () => ({
  dataDir: () => s.dir,
  logPath: () => join(s.dir, 'core.log'),
  mihomoCorePath: () => '/usr/bin/true', // checkProfile runs it with -t
  mihomoIpcPath: () => join(s.dir, 'api.sock'),
  mihomoProfileWorkDir: () => s.dir,
  mihomoTestDir: () => s.dir,
  mihomoWorkConfigPath: () => join(s.dir, 'config.yaml'),
  mihomoWorkDir: () => s.dir
}))
vi.mock('../src/main/core/mihomoApi', async (orig) => {
  const real = await orig<typeof import('../src/main/core/mihomoApi')>()
  const noop = async (): Promise<void> => {}
  return {
    ...real,
    startMihomoTraffic: noop,
    startMihomoConnections: noop,
    startMihomoLogs: () => {},
    startMihomoMemory: noop,
    stopMihomoTraffic: () => {},
    stopMihomoConnections: () => {},
    stopMihomoLogs: () => {},
    stopMihomoMemory: () => {},
    applyLogLevel: noop,
    mihomoGroups: async () => {
      if (!s.apiUp) throw new Error('api down')
      return []
    }
  }
})
vi.mock('axios', () => ({
  default: {
    create: () => ({
      defaults: { socketPath: '' },
      interceptors: { response: { use: () => {} } },
      put: async (url: string) => {
        s.puts.push(url)
        if (s.holdPuts) {
          await new Promise<void>((resolve, reject) => s.heldPuts.push({ resolve, reject }))
          return {}
        }
        if (s.putFails) throw new Error('reload rejected')
        return {}
      },
      patch: async () => ({}),
      get: async () => ({})
    })
  }
}))
vi.mock('../src/main/resolve/tray', () => ({ tray: null }))
vi.mock('../src/main/resolve/floatingWindow', () => ({ floatingWindow: null }))
vi.mock('../src/main/sys/sysproxy', () => ({ triggerSysProxy: async () => {}, disableSysProxy: async () => {} }))
vi.mock('../src/main/service/api', () => ({ setSysDns: async () => {} }))
vi.mock('../src/main/utils/i18n', () => ({ t: (k: string) => k }))

const manager = await import('../src/main/core/manager')
const { mihomoHotReloadConfig } = await import('../src/main/core/mihomoApi')

const LISTEN = 'level=info msg="RESTful API unix listening at: /tmp/a.sock"\n'
const DEFAULT = 'level=info msg="Start initial compatible provider default"\n'
const provider = (n: string): string => `level=info msg="Start initial provider ${n}"\n`
const latest = (): FakeCore => s.cores[s.cores.length - 1] as FakeCore
const refreshes = (): number => s.sent.filter((c) => c === 'groupsUpdated').length
const rulesRefreshes = (): number => s.sent.filter((c) => c === 'rulesUpdated').length
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const settled = (p: Promise<unknown>, ms = 300): Promise<string> =>
  Promise.race([
    p.then(
      () => 'resolved',
      () => 'rejected'
    ),
    sleep(ms).then(() => 'pending')
  ])

async function spawned(): Promise<FakeCore> {
  const before = s.cores.length
  for (let i = 0; i < 100 && s.cores.length === before; i++) await sleep(5)
  return latest()
}

beforeEach(async () => {
  await manager.stopCore(true)
  s.dir = mkdtempSync(join(tmpdir(), 'astra-core-'))
  s.sent = []
  s.puts = []
  s.putFails = false
  s.holdPuts = false
  s.heldPuts = []
  s.apiUp = true
  s.runtime = {}
  if (manager.STARTUP_LIMITS) Object.assign(manager.STARTUP_LIMITS, { controllerMs: 30_000, providersMs: 30_000, apiTries: 3 })
})

describe('startCore', () => {
  it('settles for a core that never writes anything', async () => {
    if (manager.STARTUP_LIMITS) Object.assign(manager.STARTUP_LIMITS, { controllerMs: 50, providersMs: 50 })
    const start = manager.startCore()
    await spawned()
    const [ready] = await start // resolved by the deadline because the API answers
    expect(await settled(ready)).toBe('resolved')
  })

  it('fails for a silent core whose API does not answer', async () => {
    if (manager.STARTUP_LIMITS) Object.assign(manager.STARTUP_LIMITS, { controllerMs: 50, providersMs: 50 })
    s.apiUp = false
    const start = manager.startCore()
    await spawned()
    expect(await settled(start, 2000)).toBe('rejected')
  })

  it('fails on a spawn error without an uncaught error', async () => {
    const start = manager.startCore()
    const core = await spawned()
    expect(() => core.emit('error', new Error('spawn ENOENT'))).not.toThrow()
    expect(await settled(start)).toBe('rejected')
  })

  it('fails when the core exits before the controller listens', async () => {
    const start = manager.startCore()
    const core = await spawned()
    core.exitCode = 1
    core.emit('exit', 1, null)
    expect(await settled(start)).toBe('rejected')
  })

  it('becomes ready with controller and provider lines in one chunk', async () => {
    const start = manager.startCore()
    ;(await spawned()).stdout.write(LISTEN + DEFAULT)
    const [ready] = await start
    expect(await settled(ready)).toBe('resolved')
    expect(refreshes()).toBe(1)
  })
})

describe('hot reload', () => {
  async function running(): Promise<FakeCore> {
    const start = manager.startCore()
    const core = await spawned()
    core.stdout.write(LISTEN + DEFAULT)
    const [ready] = await start
    await ready
    await sleep(150) // the first refresh is sent 100 ms after readiness
    return core
  }

  it('refreshes groups and rules after each successful reload', async () => {
    const core = await running()
    expect([refreshes(), rulesRefreshes()]).toEqual([1, 1])

    await mihomoHotReloadConfig()
    expect(s.puts).toEqual(['/configs?force=true'])
    core.stdout.write(DEFAULT)
    await sleep(20)
    expect([refreshes(), rulesRefreshes()]).toEqual([2, 2])

    // Second reload, now with named providers: refreshed only when all of them have started.
    s.runtime = { 'rule-providers': { ads: {} }, 'proxy-providers': { sub: {} } }
    await mihomoHotReloadConfig()
    core.stdout.write(provider('ads'))
    await sleep(20)
    expect(refreshes()).toBe(2)
    core.stdout.write(provider('sub'))
    await sleep(20)
    expect([refreshes(), rulesRefreshes()]).toEqual([3, 3])
  })

  it('announces nothing after a failed reload', async () => {
    const core = await running()
    s.putFails = true
    await expect(mihomoHotReloadConfig()).rejects.toThrow('reload rejected')
    core.stdout.write(DEFAULT)
    await sleep(20)
    expect(refreshes()).toBe(1)
  })
})

describe('overlapping reloads', () => {
  async function running(): Promise<FakeCore> {
    const start = manager.startCore()
    const core = await spawned()
    core.stdout.write(LISTEN + DEFAULT)
    const [ready] = await start
    await ready
    await sleep(150)
    return core
  }
  async function held(n: number): Promise<void> {
    for (let i = 0; i < 200 && s.heldPuts.length < n; i++) await sleep(5)
    expect(s.heldPuts.length).toBe(n)
  }

  it('an older failed reload does not cancel a newer successful one', async () => {
    const core = await running()
    s.holdPuts = true
    const a = mihomoHotReloadConfig()
    await held(1)
    s.runtime = { 'proxy-providers': { newSubscription: {} } }
    const b = mihomoHotReloadConfig()
    await held(2)
    s.heldPuts[1].resolve() // B succeeds
    await b
    s.heldPuts[0].reject(new Error('A failed')) // then A fails
    await expect(a).rejects.toThrow('A failed')
    core.stdout.write(provider('newSubscription'))
    await sleep(30)
    expect([refreshes(), rulesRefreshes()]).toEqual([2, 2]) // B refreshed exactly once
  })

  it('a newer failed reload does not cancel an older successful one', async () => {
    const core = await running()
    s.holdPuts = true
    const a = mihomoHotReloadConfig() // default provider only
    await held(1)
    s.runtime = { 'proxy-providers': { other: {} } }
    const b = mihomoHotReloadConfig()
    await held(2)
    s.heldPuts[1].reject(new Error('B failed'))
    await expect(b).rejects.toThrow('B failed')
    s.heldPuts[0].resolve()
    await a
    core.stdout.write(DEFAULT)
    await sleep(30)
    expect([refreshes(), rulesRefreshes()]).toEqual([2, 2]) // A refreshed once, B stayed quiet
    core.stdout.write(provider('other'))
    await sleep(30)
    expect(refreshes()).toBe(2)
  })

  it('an obsolete reload failing after a restart does not cancel the new start', async () => {
    await running()
    s.holdPuts = true
    const a = mihomoHotReloadConfig()
    await held(1)
    s.errors = []
    const restart = manager.restartCore()
    const fresh = await spawned()
    s.heldPuts[0].reject(new Error('A failed'))
    await expect(a).rejects.toThrow('A failed')
    fresh.stdout.write(LISTEN + DEFAULT)
    await restart
    await sleep(150)
    expect(s.errors).toEqual([])
    expect(refreshes()).toBe(2)
  })
})

// Last in this file: an accepted quit is permanent for the rest of the process.
describe('restart during an accepted quit', () => {
  it('does not start a new core when the quit is accepted while the old one stops', async () => {
    const { beginShutdown } = await import('../src/main/sys/shutdown')
    const start = manager.startCore()
    ;(await spawned()).stdout.write(LISTEN + DEFAULT)
    await start
    const before = s.cores.length
    s.errors = []

    const restart = manager.restartCore()
    beginShutdown() // accepted while restartCore is stopping the old core
    await restart
    expect(s.cores.length).toBe(before)
    expect(s.errors).toEqual([])

    // A start that is already past its first steps is refused right before the spawn.
    await expect(manager.startCore()).rejects.toBeInstanceOf(manager.ShutdownInProgress)
    expect(s.cores.length).toBe(before)
  })
})
