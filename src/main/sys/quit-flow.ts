import { beginShutdown } from './shutdown'

// Astra Clash: the before-quit decision, moved out of index.ts so it can be tested. Behavior is
// upstream's: ask for confirmation unless quitting was requested without a dialog, quit at once on
// a second attempt within 500 ms, and do nothing when the user declines. An accepted quit marks the
// shared shutdown state before shutdown starts.

export interface QuitFlowDeps {
  confirm: () => Promise<boolean>
  /** Stops the core, turns off the system proxy and exits. */
  shutdown: () => Promise<void>
  now?: () => number
}

export interface QuitFlow {
  setNotQuitDialog: () => void
  /** The system is shutting down: run the shutdown without asking, or join the one running. */
  shutdownNow: () => Promise<void>
  onBeforeQuit: (event: { preventDefault: () => void }) => Promise<void>
}

export function createQuitFlow(deps: QuitFlowDeps): QuitFlow {
  const now = deps.now ?? Date.now
  let isQuitting = false
  let notQuitDialog = false
  let lastQuitAttempt = 0

  // One shutdown per process: a second quit request while it runs joins it instead of starting
  // another.
  let shutdownTask: Promise<void> | null = null
  const accept = (): Promise<void> => {
    if (!shutdownTask) {
      isQuitting = true
      beginShutdown()
      shutdownTask = deps.shutdown()
    }
    return shutdownTask
  }

  return {
    setNotQuitDialog: () => {
      notQuitDialog = true
    },
    shutdownNow: () => accept(),
    onBeforeQuit: async (event) => {
      // Electron does not wait for an async listener: if the default quit went ahead, the process
      // could end before the shutdown steps finish. It is always prevented; the shutdown steps end
      // with an explicit exit.
      event.preventDefault()
      if (isQuitting) return
      if (!notQuitDialog) {
        const at = now()
        if (at - lastQuitAttempt < 500) {
          await accept()
          return
        }
        lastQuitAttempt = at
        if (await deps.confirm()) await accept()
      } else {
        await accept()
      }
    }
  }
}
