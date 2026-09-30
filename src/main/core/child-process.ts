import { ChildProcess } from 'child_process'

// Astra Clash: stopping the core process. Node sets ChildProcess.killed as soon as a signal is sent,
// not when the process exits, so it cannot tell whether the core is still running. These helpers
// look at the exit status instead.

export interface StopTimings {
  /** Send SIGTERM if the process is still running this long after SIGINT. */
  termAfterMs: number
  /** Send SIGKILL if it is still running this long after SIGINT. */
  killAfterMs: number
  /** Stop waiting this long after SIGINT even without an exit event, so callers never hang. */
  giveUpAfterMs: number
}

export const DEFAULT_STOP_TIMINGS: StopTimings = {
  termAfterMs: 3000,
  killAfterMs: 6000,
  giveUpAfterMs: 8000
}

export function isChildRunning(child: ChildProcess | undefined | null): boolean {
  return !!child && !!child.pid && child.exitCode === null && child.signalCode === null
}

/**
 * Stops a child process: SIGINT, then SIGTERM, then SIGKILL while it keeps running. Resolves when
 * the process exits, or after giveUpAfterMs at the latest. `log` receives a line when escalation
 * reaches SIGKILL or the wait gives up.
 */
export function stopChildProcess(
  child: ChildProcess,
  timings: StopTimings = DEFAULT_STOP_TIMINGS,
  log: (line: string) => void = () => {}
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!isChildRunning(child)) {
      resolve()
      return
    }
    const pid = child.pid

    // The core's own close handler restarts it on exit; a deliberate stop must not trigger that.
    child.removeAllListeners()
    // Without a listener, an 'error' event (for example a failed kill) would crash the main process.
    child.on('error', () => {})

    const timers: NodeJS.Timeout[] = []
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      timers.forEach((t) => clearTimeout(t))
      child.removeListener('exit', finish)
      resolve()
    }
    child.once('exit', finish)

    const send = (signal: NodeJS.Signals): void => {
      if (done || !isChildRunning(child)) return
      try {
        child.kill(signal)
      } catch {
        // The process may have exited between the check and the signal.
      }
    }

    send('SIGINT')
    timers.push(setTimeout(() => send('SIGTERM'), timings.termAfterMs))
    timers.push(
      setTimeout(() => {
        if (done || !isChildRunning(child)) return
        log(`[Manager]: Force killed process ${pid} with SIGKILL\n`)
        send('SIGKILL')
      }, timings.killAfterMs)
    )
    timers.push(
      setTimeout(() => {
        if (done) return
        log(`[Manager]: Process ${pid} did not report exit after SIGKILL, continuing\n`)
        finish()
      }, timings.giveUpAfterMs)
    )
  })
}
