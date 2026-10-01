// Astra Clash: "Restart as administrator" on Windows. The running app asks for the elevated start
// itself, while its window is in front, so the UAC prompt appears normally and a cancelled prompt
// leaves the app running. The elevated copy gets AFTER_PID_ARG with the old process id and waits
// for that process to exit before it takes the single-instance lock; otherwise it would find the
// old copy still running, hand over to it and quit.

export const AFTER_PID_ARG = '--astra-after-pid'

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`

/**
 * Arguments for the elevated copy: only the old process id. The current command line is not passed
 * on. Start-Process joins its argument list with spaces, so an argument with spaces or quotes (a
 * data folder path, the text of a clash:// link) would reach the elevated copy split into several,
 * some of them read as switches.
 */
export function elevatedArgs(pid: number): string[] {
  return [`${AFTER_PID_ARG}=${Math.trunc(pid)}`]
}

/** One PowerShell statement: Start-Process fails (exit code 1) when the prompt is cancelled. */
export function elevatedStartScript(execPath: string, args: string[]): string {
  const argList = args.length > 0 ? ` -ArgumentList ${args.map(quote).join(',')}` : ''
  return `Start-Process -FilePath ${quote(execPath)}${argList} -Verb RunAs -ErrorAction Stop`
}

export function afterPidFromArgv(argv: string[]): number | null {
  const arg = argv.find((a) => a.startsWith(`${AFTER_PID_ARG}=`))
  if (!arg) return null
  const pid = Number(arg.slice(AFTER_PID_ARG.length + 1))
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Blocks until the process has exited or the time is up; true if it exited. Runs before the app
 * takes the single-instance lock, when nothing else is running yet, so blocking is acceptable.
 */
export function waitForPidExit(pid: number, timeoutMs: number, stepMs = 100): boolean {
  const sleeper = new Int32Array(new SharedArrayBuffer(4))
  const deadline = Date.now() + timeoutMs
  while (isRunning(pid)) {
    if (Date.now() >= deadline) return false
    Atomics.wait(sleeper, 0, 0, stepMs)
  }
  return true
}
