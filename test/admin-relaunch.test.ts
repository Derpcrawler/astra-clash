// "Restart as administrator": the elevated copy waits until the copy that started it has exited,
// and gives up after the time limit, so it does not take the single-instance lock too early (it
// would then hand over to the old copy and quit, leaving nothing running).
import { describe, expect, it } from 'vitest'
import { spawn } from 'child_process'
import { waitForPidExit } from '../src/main/astra/admin-relaunch'

// A process that is not this test's child: sh starts sleep in the background and exits, so sleep
// is reaped by the system when it ends (a child of this test would stay a zombie while the test
// blocks, and still look alive).
function startDetachedSleep(seconds: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const sh = spawn('sh', ['-c', `sleep ${seconds} >/dev/null 2>&1 & echo $!`])
    let out = ''
    sh.stdout.on('data', (d) => (out += d))
    sh.on('error', reject)
    sh.on('close', () => resolve(Number(out.trim())))
  })
}

describe('waitForPidExit', () => {
  it('returns once the process has exited, not before', async () => {
    const pid = await startDetachedSleep(0.5)
    const started = Date.now()
    expect(waitForPidExit(pid, 5000)).toBe(true)
    const waited = Date.now() - started
    expect(waited).toBeGreaterThanOrEqual(300)
    expect(waited).toBeLessThan(4000)
  })

  it('gives up after the time limit while the process still runs', async () => {
    const pid = await startDetachedSleep(3)
    const started = Date.now()
    expect(waitForPidExit(pid, 400)).toBe(false)
    expect(Date.now() - started).toBeLessThan(2000)
    process.kill(pid)
  })
})
