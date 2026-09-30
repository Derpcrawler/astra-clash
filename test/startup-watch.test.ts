// Core startup at the unit level: the controller and provider lines that mark the core as ready are
// seen even when they share a stdout chunk or are split across chunks, and startup settles in every
// other case: a silent core, a spawn error, an exit, a deliberate stop, a timeout or a TUN
// permission error. The watcher and the tracker are wired the way core/manager.ts wires them. The
// full startCore and hot reload paths are covered in core-lifecycle.test.ts.
import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'events'
import { watchStartup } from '../src/main/core/startup-watch'
import { ProviderTracker, ProviderWaitCancelled } from '../src/main/core/provider-tracker'

const LISTEN = 'time="x" level=info msg="RESTful API unix listening at: /tmp/astra.sock"\n'
const DEFAULT = 'time="x" level=info msg="Start initial compatible provider default"\n'
const provider = (n: string): string => `time="x" level=info msg="Start initial provider ${n}"\n`

function fakeChild(): EventEmitter & { stdout: EventEmitter } {
  return Object.assign(new EventEmitter(), { stdout: new EventEmitter() })
}

interface Setup {
  names?: string[]
  controllerMs?: number
  providersMs?: number
  apiUp?: boolean
}

function start(child: ReturnType<typeof fakeChild>, o: Setup = {}): {
  controller: Promise<void>
  ready: Promise<void>
  stop: () => void
  apiChecks: () => number
} {
  let apiChecks = 0
  const waitForApi = async (): Promise<void> => {
    apiChecks++
    if (o.apiUp === false) throw new Error('no api')
  }
  const tracker = new ProviderTracker({
    normalize: (s) => s,
    waitForApi,
    timeoutMs: o.providersMs ?? 60_000,
    onTunPermissionError: () => 'tun failed'
  })
  const { ready } = tracker.arm(new Set(o.names ?? []))
  const w = watchStartup(child, {
    platform: 'darwin',
    startupTimeoutMs: o.controllerMs ?? 60_000,
    waitForApi,
    onUpdaterFinished: () => {},
    onLine: (l) => tracker.feed(l),
    onEnd: (e) => tracker.failAll(e)
  })
  return { controller: w.controller, ready, stop: w.stop, apiChecks: () => apiChecks }
}

const settled = (p: Promise<unknown>, ms = 200): Promise<string> =>
  Promise.race([
    p.then(
      () => 'resolved',
      () => 'rejected'
    ),
    new Promise<string>((r) => setTimeout(() => r('pending'), ms))
  ])

describe('core startup watch', () => {
  it('becomes ready when controller and provider lines share one chunk', async () => {
    const child = fakeChild()
    const s = start(child)
    child.stdout.emit('data', Buffer.from(LISTEN + DEFAULT))
    expect(await settled(s.controller)).toBe('resolved')
    expect(await settled(s.ready)).toBe('resolved')
  })

  it('joins lines split across chunks', async () => {
    const child = fakeChild()
    const s = start(child)
    const all = LISTEN + DEFAULT
    for (const part of [all.slice(0, 20), all.slice(20, 75), all.slice(75, 110), all.slice(110)]) {
      child.stdout.emit('data', part)
    }
    expect(await settled(s.ready)).toBe('resolved')
  })

  it('waits for every named provider, even when they arrive in one chunk', async () => {
    const child = fakeChild()
    const s = start(child, { names: ['rules', 'Proxy 🌍'] })
    child.stdout.emit('data', LISTEN + provider('rules'))
    expect(await settled(s.ready)).toBe('pending')
    child.stdout.emit('data', provider('Proxy 🌍') + DEFAULT)
    expect(await settled(s.ready)).toBe('resolved')
  })

  it('settles a silent core by the deadline: up if the API answers', async () => {
    const child = fakeChild()
    const s = start(child, { controllerMs: 20, providersMs: 20 })
    expect(await settled(s.controller)).toBe('resolved')
    expect(await settled(s.ready)).toBe('resolved')
    expect(s.apiChecks()).toBeGreaterThan(0)
  })

  it('settles a silent core by the deadline: failed if the API does not answer', async () => {
    const child = fakeChild()
    const s = start(child, { controllerMs: 20, providersMs: 20, apiUp: false })
    expect(await settled(s.controller)).toBe('rejected')
    expect(await settled(s.ready)).toBe('rejected')
  })

  it('turns a spawn error into a rejected startup without throwing', async () => {
    const child = fakeChild()
    const s = start(child)
    expect(() => child.emit('error', new Error('spawn ENOENT'))).not.toThrow()
    expect(await settled(s.controller)).toBe('rejected')
    expect(await settled(s.ready)).toBe('rejected')
  })

  it('rejects both when the core exits before the controller listens', async () => {
    const child = fakeChild()
    const s = start(child)
    child.emit('exit', 1, null)
    expect(await settled(s.controller)).toBe('rejected')
    expect(await settled(s.ready)).toBe('rejected')
  })

  it('rejects readiness when the core exits after the controller listens', async () => {
    const child = fakeChild()
    const s = start(child)
    child.stdout.emit('data', LISTEN)
    child.emit('exit', null, 'SIGKILL')
    expect(await settled(s.controller)).toBe('resolved')
    expect(await settled(s.ready)).toBe('rejected')
  })

  it('rejects the controller on a listen error', async () => {
    const child = fakeChild()
    const s = start(child)
    child.stdout.emit('data', 'level=error msg="External controller unix listen error: busy"\n')
    expect(await settled(s.controller)).toBe('rejected')
  })

  it('settles missing provider lines by the deadline when the API answers', async () => {
    const child = fakeChild()
    const s = start(child, { providersMs: 20 })
    child.stdout.emit('data', LISTEN)
    expect(await settled(s.ready)).toBe('resolved')
  })

  it('rejects readiness with the TUN permission reason', async () => {
    const child = fakeChild()
    const s = start(child)
    child.stdout.emit(
      'data',
      LISTEN + 'level=error msg="Start TUN listening error: configure tun interface: Connect: operation not permitted"\n'
    )
    await expect(s.ready).rejects.toBe('tun failed')
  })

  it('detaches on a deliberate stop', async () => {
    const child = fakeChild()
    const s = start(child)
    s.stop()
    expect(await settled(s.controller)).toBe('rejected')
    expect(child.listenerCount('exit') + child.listenerCount('error') + child.stdout.listenerCount('data')).toBe(0)
  })

  it('waits are independent: cancelling one leaves the others', async () => {
    const tracker = new ProviderTracker({ normalize: (x) => x, waitForApi: async () => {}, timeoutMs: 60_000, onTunPermissionError: () => 'x' })
    const first = tracker.arm(new Set())
    const second = tracker.arm(new Set())
    first.cancel()
    await expect(first.ready).rejects.toBeInstanceOf(ProviderWaitCancelled)
    tracker.feed(DEFAULT)
    expect(await settled(second.ready)).toBe('resolved')
    second.cancel() // after settling: no effect
    expect(await settled(second.ready)).toBe('resolved')
  })
})
