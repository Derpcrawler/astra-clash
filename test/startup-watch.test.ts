// Core startup: the controller and provider lines that mark the core as ready are seen even when
// they share a stdout chunk or are split across chunks, and startup settles when the core exits,
// reports a listen error or a TUN permission error, or does not report its providers in time.
import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'events'
import { watchStartup, StartupWatchOptions } from '../src/main/core/startup-watch'

const LISTEN = 'time="x" level=info msg="RESTful API unix listening at: /tmp/astra.sock"\n'
const DEFAULT = 'time="x" level=info msg="Start initial compatible provider default"\n'
const provider = (n: string): string => `time="x" level=info msg="Start initial provider ${n}"\n`

function fakeChild(): EventEmitter & { stdout: EventEmitter } {
  return Object.assign(new EventEmitter(), { stdout: new EventEmitter() })
}

function opts(over: Partial<StartupWatchOptions> = {}): StartupWatchOptions {
  return {
    platform: 'darwin',
    providerNames: new Set(),
    unmatchedProviders: new Set(),
    normalize: (s) => s,
    waitForApi: async () => {},
    onTunPermissionError: () => 'tun failed',
    onUpdaterFinished: () => {},
    readyTimeoutMs: 60_000,
    ...over
  }
}

const settled = (p: Promise<unknown>): Promise<string> =>
  Promise.race([
    p.then(
      () => 'resolved',
      () => 'rejected'
    ),
    new Promise<string>((r) => setTimeout(() => r('pending'), 200))
  ])

describe('watchStartup', () => {
  it('becomes ready when controller and provider lines share one chunk', async () => {
    const child = fakeChild()
    const w = watchStartup(child, opts())
    child.stdout.emit('data', Buffer.from(LISTEN + DEFAULT))
    expect(await settled(w.controller)).toBe('resolved')
    expect(await settled(w.ready)).toBe('resolved')
  })

  it('joins lines split across chunks', async () => {
    const child = fakeChild()
    const w = watchStartup(child, opts())
    const all = LISTEN + DEFAULT
    for (const part of [all.slice(0, 20), all.slice(20, 75), all.slice(75, 110), all.slice(110)]) {
      child.stdout.emit('data', part)
    }
    expect(await settled(w.ready)).toBe('resolved')
  })

  it('waits for every named provider, even when they arrive in one chunk', async () => {
    const child = fakeChild()
    const names = new Set(['rules', 'Proxy 🌍'])
    const w = watchStartup(child, opts({ providerNames: names, unmatchedProviders: new Set(names) }))
    child.stdout.emit('data', LISTEN + provider('rules'))
    expect(await settled(w.ready)).toBe('pending')
    child.stdout.emit('data', provider('Proxy 🌍') + DEFAULT)
    expect(await settled(w.ready)).toBe('resolved')
  })

  it('rejects both when the core exits before the controller listens', async () => {
    const child = fakeChild()
    const w = watchStartup(child, opts())
    child.emit('exit', 1, null)
    expect(await settled(w.controller)).toBe('rejected')
    expect(await settled(w.ready)).toBe('rejected')
  })

  it('rejects readiness when the core exits after the controller listens', async () => {
    const child = fakeChild()
    const w = watchStartup(child, opts())
    child.stdout.emit('data', LISTEN)
    child.emit('exit', null, 'SIGKILL')
    expect(await settled(w.controller)).toBe('resolved')
    expect(await settled(w.ready)).toBe('rejected')
  })

  it('rejects the controller on a listen error', async () => {
    const child = fakeChild()
    const w = watchStartup(child, opts())
    child.stdout.emit('data', 'level=error msg="External controller unix listen error: busy"\n')
    expect(await settled(w.controller)).toBe('rejected')
  })

  it('settles after the timeout: ready if the API answers, rejected if not', async () => {
    const up = fakeChild()
    const a = watchStartup(up, opts({ readyTimeoutMs: 20 }))
    up.stdout.emit('data', LISTEN)
    expect(await settled(a.ready)).toBe('resolved')

    const down = fakeChild()
    const b = watchStartup(down, opts({ readyTimeoutMs: 20, waitForApi: async () => Promise.reject(new Error('no api')) }))
    down.stdout.emit('data', LISTEN)
    expect(await settled(b.ready)).toBe('rejected')
  })

  it('rejects readiness with the TUN permission reason', async () => {
    const child = fakeChild()
    const w = watchStartup(child, opts())
    child.stdout.emit('data', LISTEN + 'level=error msg="Start TUN listening error: configure tun interface: Connect: operation not permitted"\n')
    await expect(w.ready).rejects.toBe('tun failed')
  })
})
