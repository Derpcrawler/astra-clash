// Stopping the core: a core that ignores SIGINT still gets SIGTERM and then SIGKILL, a core that
// exits on SIGINT gets nothing more, and the stop finishes within a bound.
import { describe, expect, it, vi } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import { isChildRunning, stopChildProcess } from '../src/main/core/child-process'

function spawnChild(script: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] })
  // Wait until the script has installed its handlers.
  return new Promise((resolve) => child.stdout!.once('data', () => resolve(child)))
}

const FAST = { termAfterMs: 200, killAfterMs: 400, giveUpAfterMs: 3000 }

describe('stopChildProcess', () => {
  it('escalates to SIGKILL when the process ignores SIGINT and SIGTERM', async () => {
    const child = await spawnChild(
      "process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);console.log('ready')"
    )
    const kill = vi.spyOn(child, 'kill')
    const started = Date.now()
    await stopChildProcess(child, FAST)
    try {
      expect(kill.mock.calls.map((c) => c[0])).toEqual(['SIGINT', 'SIGTERM', 'SIGKILL'])
      expect(child.signalCode).toBe('SIGKILL')
      expect(isChildRunning(child)).toBe(false)
      expect(Date.now() - started).toBeLessThan(FAST.giveUpAfterMs)
    } finally {
      if (isChildRunning(child)) child.kill('SIGKILL')
    }
  })

  it('sends only SIGINT to a process that exits on it', async () => {
    const child = await spawnChild("setInterval(()=>{},1000);console.log('ready')")
    const kill = vi.spyOn(child, 'kill')
    await stopChildProcess(child, FAST)
    // Past the SIGTERM and SIGKILL times: no further signals after the exit.
    await new Promise((r) => setTimeout(r, FAST.killAfterMs + 100))
    expect(kill.mock.calls.map((c) => c[0])).toEqual(['SIGINT'])
    expect(child.signalCode).toBe('SIGINT')
  })

  it('resolves at once for a process that already exited', async () => {
    const child = await spawnChild("console.log('ready')")
    await new Promise((r) => child.once('exit', r))
    await expect(stopChildProcess(child, FAST)).resolves.toBeUndefined()
  })
})
