// Wake recovery and an accepted quit: when the core fails its wake health check and a quit is
// accepted while recovery writes its log line, the core is not restarted. This runs the real
// recovery module and the production quit decision; the log write, the health check and the OS
// proxy calls are fixtures. Its own file, because an accepted quit is permanent for the rest of the
// process.
import { describe, expect, it, vi } from 'vitest'

const s = vi.hoisted(() => ({
  ops: [] as string[],
  logGate: null as null | Promise<void>
}))

vi.mock('fs/promises', async (orig) => {
  const real = await orig<typeof import('fs/promises')>()
  return {
    ...real,
    writeFile: async (...args: Parameters<typeof real.writeFile>) => {
      if (String(args[0]).endsWith('resume-shutdown.log')) {
        if (s.logGate) await s.logGate
        return
      }
      return real.writeFile(...args)
    }
  }
})
vi.mock('../src/main/config', () => ({
  getAppConfig: async () => ({ proxyMode: true, sysProxy: { enable: true, mode: 'manual', settingMode: 'service' } }),
  getControledMihomoConfig: async () => ({ tun: { enable: false }, 'mixed-port': 7897 })
}))
vi.mock('../src/main/core/manager', () => ({
  hasCoreProcess: () => true,
  restartCore: async () => {
    s.ops.push('restart')
  }
}))
vi.mock('../src/main/core/mihomoApi', () => ({
  mihomoVersion: async () => {
    throw new Error('core does not answer')
  },
  mihomoHotReloadConfig: async () => {
    s.ops.push('reload')
  }
}))
vi.mock('../src/main/utils/dirs', () => ({
  logPath: () => '/nonexistent/resume-shutdown.log',
  servicePath: () => '/nonexistent'
}))
vi.mock('../src/main/service/api', () => ({
  setProxy: async () => {
    s.ops.push('enable')
  },
  setPac: async () => {
    s.ops.push('enable')
  },
  disableProxy: async () => {
    s.ops.push('disable')
  }
}))
vi.mock('../src/main/resolve/server', () => ({ pacPort: 0, startPacServer: async () => {}, stopPacServer: async () => {} }))
vi.mock('../src/main/utils/i18n', () => ({ t: (k: string) => k }))

const { recoverAfterResume } = await import('../src/main/sys/resume')
const { createQuitFlow } = await import('../src/main/sys/quit-flow')

describe('wake recovery and an accepted quit', () => {
  it('does not restart the core when the quit is accepted during the log write', async () => {
    let releaseLog!: () => void
    s.logGate = new Promise((r) => (releaseLog = r))
    let finishStop!: () => void
    const flow = createQuitFlow({
      confirm: async () => true,
      now: () => 10_000,
      shutdown: () => {
        s.ops.push('quit-stop')
        return new Promise<void>((r) => (finishStop = r)) // still stopping when the log returns
      }
    })

    const recovery = recoverAfterResume(0)
    await new Promise((r) => setTimeout(r, 20)) // health check failed, log write held
    void flow.onBeforeQuit({ preventDefault: () => {} })
    await new Promise((r) => setTimeout(r, 5))
    releaseLog()
    await recovery
    finishStop()

    expect(s.ops).toEqual(['quit-stop'])
  })
})
