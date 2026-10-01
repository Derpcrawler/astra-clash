// Astra Clash: the last steps of quitting, shared by Quit and the system's shutdown. The system
// proxy is turned off and the core stopped at the same time, and the app exits only when both have
// finished, so the system is not left pointing at a proxy that no longer runs. A failure in either
// step is logged and does not skip the other. A step that hangs cannot keep the app alive: after
// `limitMs` the wait ends. Before the exit, the tracked core, if still running, is killed with
// SIGKILL (up to 0.5 s; nothing happens after a clean stop), also when stopping it failed before it
// sent a signal. The exit runs even if that step throws.

export const SHUTDOWN_LIMIT_MS = 4000

export interface ShutdownSteps {
  disableSystemProxy: () => Promise<void>
  stopCore: () => Promise<void>
  /** SIGKILL for a core that is still running; called before every exit, a no-op after a clean stop. */
  killCore: () => Promise<void>
  exit: () => void
  log: (line: string) => void
  limitMs?: number
}

export async function shutdownAndExit(steps: ShutdownSteps): Promise<void> {
  const limitMs = steps.limitMs ?? SHUTDOWN_LIMIT_MS
  const proxy = steps
    .disableSystemProxy()
    .catch((error) => steps.log(`[Shutdown]: turning off the system proxy failed, ${error}\n`))
  const core = steps.stopCore().catch((error) => steps.log(`[Shutdown]: stopping the core failed, ${error}\n`))
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), limitMs)
  })
  const result = await Promise.race([Promise.all([proxy, core]).then(() => 'done' as const), late])
  clearTimeout(timer)
  if (result === 'late') steps.log(`[Shutdown]: not finished after ${limitMs} ms\n`)
  try {
    await Promise.resolve()
      .then(() => steps.killCore())
      .catch((error) => steps.log(`[Shutdown]: killing the core failed, ${error}\n`))
  } finally {
    steps.exit()
  }
}
