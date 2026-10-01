// A core that ignores SIGINT and SIGTERM does not outlive the app: when quitting reaches its time
// limit, the core is killed before the app exits. A core that stops on SIGINT gets no further
// signal. Real child processes, the real stop helper and the real shutdown sequence with its
// production time limit; only exit is recorded instead of ending the test runner.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import { DEFAULT_STOP_TIMINGS, killChildNow, stopChildProcess } from '../src/main/core/child-process'
import { shutdownAndExit } from '../src/main/astra/shutdown-sequence'

function startCore(ignoreSignals: boolean): Promise<ChildProcess> {
  const code = ignoreSignals
    ? "process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"
    : "console.log('ready');setInterval(()=>{},1000)"
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'] })
  return new Promise((resolve) => child.stdout!.once('data', () => resolve(child)))
}

const gone = (child: ChildProcess): boolean => child.exitCode !== null || child.signalCode !== null

// Children that ignore SIGINT and SIGTERM must not survive a failing assertion.
const started: ChildProcess[] = []
const track = (child: ChildProcess): ChildProcess => (started.push(child), child)
afterEach(() => {
  for (const child of started.splice(0)) if (!gone(child)) child.kill('SIGKILL')
})

describe('quit and a core that does not stop', () => {
  it('kills a core that ignores SIGINT and SIGTERM before the app exits', async () => {
    const child = track(await startCore(true))
    const exit = vi.fn()
    let goneAtExit = false
    await shutdownAndExit({
      disableSystemProxy: async () => {},
      stopCore: () => stopChildProcess(child, DEFAULT_STOP_TIMINGS),
      killCore: () => killChildNow(child),
      exit: () => {
        goneAtExit = gone(child)
        exit()
      },
      log: () => {}
    })
    expect(exit).toHaveBeenCalledTimes(1)
    expect(goneAtExit).toBe(true)
    expect(child.signalCode).toBe('SIGKILL')
  })

  it('sends nothing more to a core that stops on SIGINT', async () => {
    const child = track(await startCore(false))
    const signals: string[] = []
    const kill = child.kill.bind(child)
    child.kill = (signal?: NodeJS.Signals | number): boolean => {
      signals.push(String(signal))
      return kill(signal)
    }
    const started = Date.now()
    await shutdownAndExit({
      disableSystemProxy: async () => {},
      stopCore: () => stopChildProcess(child, DEFAULT_STOP_TIMINGS),
      killCore: () => killChildNow(child),
      exit: () => {},
      log: () => {}
    })
    expect(signals).toEqual(['SIGINT'])
    expect(child.signalCode).toBe('SIGINT')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('kills the core when stopping it fails before it sends a signal', async () => {
    const child = track(await startCore(false))
    let goneAtExit = false
    await shutdownAndExit({
      disableSystemProxy: async () => {},
      stopCore: async () => {
        throw new Error('stopping failed before any signal')
      },
      killCore: () => killChildNow(child),
      exit: () => {
        goneAtExit = gone(child)
      },
      log: () => {},
      limitMs: 1000
    })
    expect(goneAtExit).toBe(true)
    expect(child.signalCode).toBe('SIGKILL')
  })

  it('exits even when killing the core throws', async () => {
    const exit = vi.fn()
    await shutdownAndExit({
      disableSystemProxy: async () => {},
      stopCore: async () => {},
      killCore: () => {
        throw new Error('kill threw')
      },
      exit,
      log: () => {}
    })
    expect(exit).toHaveBeenCalledTimes(1)
  })
})
