// On Linux all four live streams of the core (traffic, memory, logs, connections) connect to the
// socket at its real path, query string included, also when the folder name has a space or
// non-ASCII characters. Read as a URL, such a path would be percent-encoded and a stream would reach
// a different socket than the API client, possibly one another user placed in the folder with the
// encoded name. When no socket folder qualifies (the path lookup throws), starting a stream and its
// retry after a closed connection end quietly instead of throwing or rejecting unhandled.
// Real Unix-socket WebSocket servers: one at the real path, a decoy at the percent-encoded path.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, Server } from 'http'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'fs'
import { join } from 'path'
import { WebSocketServer } from 'ws'

const s = vi.hoisted(() => ({ socketPath: '', throws: false }))

vi.mock('../src/main/utils/dirs', () => ({
  mihomoIpcPath: () => {
    if (s.throws) throw new Error('No private folder for the core control socket')
    return s.socketPath
  }
}))
vi.mock('../src/main/index', () => ({ mainWindow: null }))
vi.mock('../src/main/config', () => ({
  getAppConfig: async () => ({ connectionInterval: 750 }),
  getControledMihomoConfig: async () => ({})
}))
vi.mock('../src/main/resolve/tray', () => ({ tray: null }))
vi.mock('../src/main/resolve/floatingWindow', () => ({ floatingWindow: null }))
vi.mock('../src/main/core/factory', () => ({ getRuntimeConfig: async () => ({}) }))

const api = await import('../src/main/core/mihomoApi')

const realPlatform = process.platform
let root: string
const servers: Server[] = []

function listen(socketPath: string, onConnect: (url: string, close: () => void) => void): Promise<void> {
  const server = createServer()
  const wss = new WebSocketServer({ server })
  wss.on('connection', (ws, req) => onConnect(req.url ?? '', () => ws.close()))
  servers.push(server)
  return new Promise((resolve) => server.listen(socketPath, resolve))
}

const waitFor = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
}

function stopAll(): void {
  api.stopMihomoTraffic()
  api.stopMihomoMemory()
  api.stopMihomoLogs()
  api.stopMihomoConnections()
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
  root = mkdtempSync(join(realpathSync('/tmp'), 'ws-'))
  s.throws = false
})

afterEach(async () => {
  stopAll()
  Object.defineProperty(process, 'platform', { value: realPlatform })
  await Promise.all(servers.splice(0).map((srv) => new Promise((r) => srv.close(r))))
  rmSync(root, { recursive: true, force: true })
})

describe('Linux core streams', () => {
  it.each(['with space', 'папка', '用户'])('all four reach the socket in a folder named %s', async (name) => {
    const real = join(root, name)
    const decoy = join(root, encodeURIComponent(name))
    mkdirSync(real)
    mkdirSync(decoy)
    const hits: string[] = []
    await listen(join(real, 'api.sock'), (url) => hits.push(`real ${url}`))
    await listen(join(decoy, 'api.sock'), (url) => hits.push(`decoy ${url}`))
    s.socketPath = join(real, 'api.sock')

    await api.startMihomoTraffic()
    await api.startMihomoMemory()
    api.startMihomoLogs('warning')
    await api.startMihomoConnections()
    await waitFor(() => hits.length >= 4)
    expect(hits.sort()).toEqual([
      'real /connections?interval=750',
      'real /logs?level=warning',
      'real /memory',
      'real /traffic'
    ])
  })

  it('end quietly when the socket path lookup throws, at start and on a retry', async () => {
    const rejections: unknown[] = []
    const onRejection = (e: unknown): void => {
      rejections.push(e)
    }
    process.on('unhandledRejection', onRejection)
    try {
      s.throws = true
      await expect(api.startMihomoTraffic()).resolves.toBeUndefined()
      await expect(api.startMihomoMemory()).resolves.toBeUndefined()
      expect(() => api.startMihomoLogs('info')).not.toThrow()
      await expect(api.startMihomoConnections()).resolves.toBeUndefined()

      // A stream whose connection closes retries; by then the lookup throws.
      s.throws = false
      const real = join(root, 'retry')
      mkdirSync(real)
      let connected = 0
      await listen(join(real, 'api.sock'), (_url, close) => {
        connected++
        s.throws = true
        close()
      })
      s.socketPath = join(real, 'api.sock')
      await api.startMihomoTraffic()
      await waitFor(() => connected > 0)
      await new Promise((r) => setTimeout(r, 100))
      expect(connected).toBe(1)
      expect(rejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onRejection)
    }
  })
})
