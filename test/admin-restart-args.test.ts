// Windows "Restart as administrator": nothing from the current command line reaches the elevated
// copy. Start-Process joins its argument list with spaces, so a data folder path with a space or the
// text of a clash:// link would arrive split, part of it read as extra switches. This runs the real
// IPC handler; PowerShell, the window and the other modules are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  // A module stand-in that offers a mock function under any name the handler module imports.
  const stub = (): object => {
    const fns: Record<string, unknown> = {}
    return new Proxy(fns, {
      get: (t, k) => (k === 'then' || k === '__esModule' ? undefined : (t[k as string] ??= vi.fn(() => Promise.resolve(undefined))))
    })
  }
  return { stub, handlers: {} as Record<string, () => Promise<unknown>>, calls: [] as string[][] }
})

vi.mock('electron', async () => {
  const real = await vi.importActual<typeof import('./mocks/electron')>('./mocks/electron')
  return {
    ...real,
    ipcMain: { ...real.ipcMain, handle: (name: string, fn: () => Promise<unknown>) => (h.handlers[name] = fn) },
    app: { ...real.app, quit: vi.fn(), exit: vi.fn() }
  }
})
vi.mock('child_process', () => ({
  execFile: (file: string, args: string[], _opts: unknown, cb: (e: Error | null, out: string, err: string) => void) => {
    h.calls.push([file, ...args])
    cb(null, '', '')
  }
}))
vi.mock('fs/promises', () => ({ appendFile: async () => {}, readFile: async () => '', writeFile: async () => {} }))
vi.mock('../src/main/index', h.stub)
vi.mock('../src/main/astra/core-download', h.stub)
vi.mock('../src/main/config', h.stub)
vi.mock('../src/main/core/factory', h.stub)
vi.mock('../src/main/core/manager', h.stub)
vi.mock('../src/main/core/mihomoApi', h.stub)
vi.mock('../src/main/resolve/autoUpdater', h.stub)
vi.mock('../src/main/resolve/floatingWindow', h.stub)
vi.mock('../src/main/resolve/menu', h.stub)
vi.mock('../src/main/resolve/shortcut', h.stub)
vi.mock('../src/main/resolve/theme', h.stub)
vi.mock('../src/main/resolve/tray', h.stub)
vi.mock('../src/main/service/manager', h.stub)
vi.mock('../src/main/sys/autoRun', h.stub)
vi.mock('../src/main/sys/interface', h.stub)
vi.mock('../src/main/sys/misc', h.stub)
vi.mock('../src/main/sys/sysproxy', h.stub)
vi.mock('../src/main/utils/appName', h.stub)
vi.mock('../src/main/utils/dirs', h.stub)
vi.mock('../src/main/utils/elevation', h.stub)
vi.mock('../src/main/utils/i18n', h.stub)
vi.mock('../src/main/utils/icon', h.stub)
vi.mock('../src/main/utils/safeSend', h.stub)
vi.mock('../src/main/utils/userAgent', h.stub)

const realPlatform = process.platform
const realArgv = process.argv

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  process.argv = [
    'C:\\Program Files\\Astra Clash\\Astra Clash.exe',
    '--user-data-dir=C:\\Users\\Alice Smith\\Astra',
    'clash://install-config?url=https://example.com/sub&name=Work --disable-gpu'
  ]
  h.calls.length = 0
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
  process.argv = realArgv
})

describe('Restart as administrator', () => {
  it('passes only the old process id to the elevated copy', async () => {
    const { registerIpcMainHandlers } = await import('../src/main/utils/ipc')
    registerIpcMainHandlers()
    await h.handlers.restartAsAdmin()

    const ps = h.calls.find((c) => c[0] === 'powershell.exe')
    expect(ps).toBeDefined()
    const script = ps![ps!.indexOf('-Command') + 1]
    const list = /-ArgumentList (.*?) -Verb RunAs/.exec(script)?.[1]
    expect(list).toBe(`'--astra-after-pid=${process.pid}'`)
    expect(script).not.toMatch(/Alice|disable-gpu|clash:/)
  })
})
