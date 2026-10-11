// Picking a node in the menu bar menu closes only the connections that go through that group.
// Connections through other groups or DIRECT stay open. Runs the real menu and API code against a
// fake mihomo controller on a Unix socket.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, Server } from 'http'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const s = vi.hoisted(() => ({ dir: '', requests: [] as string[] }))

vi.mock('electron', async (orig) => {
  const real = (await orig()) as Record<string, unknown>
  return {
    ...real,
    Menu: { buildFromTemplate: (template: unknown): unknown => template },
    clipboard: {},
    screen: {}
  }
})
vi.mock('../resources/icon.ico?asset', () => ({ default: '' }))
vi.mock('../resources/icon_off.ico?asset', () => ({ default: '' }))
vi.mock('../resources/icon.png?asset', () => ({ default: '' }))
vi.mock('../resources/icon_off.png?asset', () => ({ default: '' }))
vi.mock('../resources/icon_on_mac.png?asset', () => ({ default: '' }))
vi.mock('../resources/icon_off_mac.png?asset', () => ({ default: '' }))
vi.mock('../src/main/index', () => ({
  mainWindow: null,
  setNotQuitDialog: (): void => {},
  showMainWindow: (): void => {},
  triggerMainWindow: (): void => {}
}))
vi.mock('../src/main/config', () => ({
  getAppConfig: async () => ({ autoCloseConnection: true, proxyInTray: true }),
  getControledMihomoConfig: async () => ({ mode: 'rule', tun: { enable: false } }),
  getProfileConfig: async () => ({ items: [] }),
  changeCurrentProfile: async (): Promise<void> => {},
  patchAppConfig: async (): Promise<void> => {},
  patchControledMihomoConfig: async (): Promise<void> => {}
}))
vi.mock('../src/main/core/factory', () => ({
  getRuntimeConfig: async () => ({ 'proxy-groups': [{ name: 'Proxy' }] })
}))
vi.mock('../src/main/utils/dirs', () => ({
  mihomoIpcPath: () => join(s.dir, 'api.sock')
}))
vi.mock('../src/main/sys/sysproxy', () => ({ triggerSysProxy: async (): Promise<void> => {} }))
vi.mock('../src/main/resolve/floatingWindow', () => ({ floatingWindow: null }))
vi.mock('../src/main/resolve/theme', () => ({ applyTheme: async (): Promise<void> => {} }))
vi.mock('../src/main/utils/i18n', () => ({ t: (k: string) => k }))

const node = (name: string): object => ({ name, type: 'Vless', history: [] })

let server: Server

beforeAll(async () => {
  s.dir = mkdtempSync(join(tmpdir(), 'noctur-tray-'))
  server = createServer((req, res) => {
    s.requests.push(`${req.method} ${decodeURIComponent(req.url ?? '')}`)
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'GET' && req.url === '/proxies') {
      res.end(
        JSON.stringify({
          proxies: {
            Proxy: { name: 'Proxy', type: 'Selector', now: 'NL', all: ['NL', 'US'], history: [] },
            NL: node('NL'),
            US: node('US')
          }
        })
      )
    } else if (req.method === 'GET' && req.url === '/connections') {
      res.end(
        JSON.stringify({
          connections: [
            { id: 'via-proxy', chains: ['NL', 'Proxy'] },
            { id: 'direct', chains: ['DIRECT'] }
          ]
        })
      )
    } else {
      res.statusCode = 204
      res.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(join(s.dir, 'api.sock'), resolve))
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(s.dir, { recursive: true, force: true })
})

describe('menu bar node switch', () => {
  it('closes only the connections of the switched group', async () => {
    const { buildContextMenu } = await import('../src/main/resolve/tray')
    const menu = (await buildContextMenu()) as unknown as Electron.MenuItemConstructorOptions[]
    const group = menu.find((item) => item.id === 'Proxy')
    const us = (group?.submenu as Electron.MenuItemConstructorOptions[]).find(
      (item) => item.id === 'US'
    )
    s.requests.length = 0
    await (us?.click as () => Promise<void>)()

    expect(s.requests).toContain('PUT /proxies/Proxy')
    expect(s.requests).toContain('DELETE /connections/via-proxy')
    expect(s.requests).not.toContain('DELETE /connections/direct')
    expect(s.requests).not.toContain('DELETE /connections')
  })
})
