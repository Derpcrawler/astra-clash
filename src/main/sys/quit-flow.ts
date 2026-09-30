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
  onBeforeQuit: (event: { preventDefault: () => void }) => Promise<void>
}

export function createQuitFlow(deps: QuitFlowDeps): QuitFlow {
  const now = deps.now ?? Date.now
  let isQuitting = false
  let notQuitDialog = false
  let lastQuitAttempt = 0

  const accept = async (): Promise<void> => {
    isQuitting = true
    beginShutdown()
    await deps.shutdown()
  }

  return {
    setNotQuitDialog: () => {
      notQuitDialog = true
    },
    onBeforeQuit: async (event) => {
      if (!isQuitting && !notQuitDialog) {
        event.preventDefault()
        const at = now()
        if (at - lastQuitAttempt < 500) {
          await accept()
          return
        }
        lastQuitAttempt = at
        if (await deps.confirm()) await accept()
      } else if (notQuitDialog) {
        await accept()
      }
    }
  }
}
