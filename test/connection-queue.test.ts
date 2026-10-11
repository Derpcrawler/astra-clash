// Connect, Disconnect and method changes from Home, the menu bar and Settings share one queue
// (src/main/noctur/connection.ts). Runs the real module with the config, core reload and system
// proxy calls recorded in memory; nothing reaches the OS.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Op = Record<string, unknown> | string

const s = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  core: {} as Record<string, unknown>,
  ops: [] as (Record<string, unknown> | string)[],
  holdCorePatch: null as null | { entered: () => void; gate: Promise<void> },
  holdProxyOn: null as null | { entered: () => void; gate: Promise<void>; fail?: boolean }
}))

const merge = (dst: Record<string, unknown>, patch: Record<string, unknown>): void => {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      dst[k] = dst[k] ?? {}
      merge(dst[k] as Record<string, unknown>, v as Record<string, unknown>)
    } else dst[k] = v
  }
}

vi.mock('../src/main/config', () => ({
  getAppConfig: async () => structuredClone(s.app),
  getControledMihomoConfig: async () => structuredClone(s.core),
  patchAppConfig: async (p: Record<string, unknown>) => {
    merge(s.app, p)
    s.ops.push({ app: p })
  },
  patchControledMihomoConfig: async (p: Record<string, unknown>) => {
    merge(s.core, p)
    s.ops.push({ core: p })
    const hold = s.holdCorePatch
    if (hold) {
      s.holdCorePatch = null
      hold.entered()
      await hold.gate
    }
  }
}))
vi.mock('../src/main/core/mihomoApi', () => ({
  mihomoHotReloadConfig: async () => {
    s.ops.push('reload')
  }
}))
vi.mock('../src/main/sys/sysproxy', () => ({
  triggerSysProxy: async (enable: boolean) => {
    const hold = s.holdProxyOn
    if (enable && hold) {
      s.holdProxyOn = null
      hold.entered()
      await hold.gate
      if (hold.fail) throw new Error('proxy failed')
    }
    s.ops.push({ osProxy: enable })
  }
}))
vi.mock('../src/main/index', () => ({ mainWindow: null }))
vi.mock('../src/main/resolve/floatingWindow', () => ({ floatingWindow: null }))
vi.mock('../src/main/utils/i18n', () => ({ t: (k: string) => k }))

import { changeConnectionMethod, setConnected } from '../src/main/noctur/connection'

function hold(): { entered: Promise<void>; release: () => void; spec: { entered: () => void; gate: Promise<void> } } {
  let entered!: () => void
  let release!: () => void
  const enteredP = new Promise<void>((r) => (entered = r))
  const gate = new Promise<void>((r) => (release = r))
  return { entered: enteredP, release, spec: { entered, gate } }
}

// Anything turned on after the given point: the system proxy or TUN.
const turnedOnAfter = (index: number): boolean =>
  s.ops.slice(index).some(
    (o: Op) =>
      typeof o === 'object' &&
      (o.osProxy === true || (o.core as { tun?: { enable?: boolean } })?.tun?.enable === true)
  )

beforeEach(() => {
  s.app = { mainSwitchMode: 'tun', proxyMode: false, sysProxy: { enable: true, mode: 'manual' } }
  s.core = { tun: { enable: true }, dns: { enable: true }, 'mixed-port': 7897 }
  s.ops = []
  s.holdCorePatch = null
  s.holdProxyOn = null
})

describe('connection queue', () => {
  it('a Disconnect during a method change leaves the connection off', async () => {
    const h = hold()
    s.holdCorePatch = h.spec // the change's first step, turning TUN off, waits (DNS restore)
    const change = changeConnectionMethod('sysproxy')
    await h.entered
    const disconnect = setConnected(false)
    const opsAtDisconnect = s.ops.length
    h.release()
    await change
    await disconnect
    expect(turnedOnAfter(opsAtDisconnect)).toBe(false)
    expect(s.app.proxyMode).toBe(false)
    expect((s.core.tun as { enable: boolean }).enable).toBe(false)
    expect(s.app.mainSwitchMode).toBe('sysproxy')
  })

  it('a failed new method does not bring the old one back after a Disconnect', async () => {
    const h = hold()
    s.holdProxyOn = { ...h.spec, fail: true }
    const change = changeConnectionMethod('sysproxy')
    await h.entered
    const disconnect = setConnected(false)
    const opsAtDisconnect = s.ops.length
    h.release()
    await expect(change).rejects.toThrow('proxy failed')
    await disconnect
    expect(turnedOnAfter(opsAtDisconnect)).toBe(false)
    expect((s.core.tun as { enable: boolean }).enable).toBe(false)
    expect(s.app.proxyMode).toBe(false)
  })

  it('refuses to switch a working TUN connection to System Proxy without a mixed port', async () => {
    s.core['mixed-port'] = 0
    await expect(changeConnectionMethod('sysproxy')).rejects.toThrow('tray.proxyNeedsPort')
    expect((s.core.tun as { enable: boolean }).enable).toBe(true)
    expect(s.app.mainSwitchMode).toBe('tun')
    expect(s.ops).toEqual([])
  })
})
