// Electron does not wait for an async before-quit listener, so the default quit must be prevented
// whenever the app is shutting down: also for a quit without the confirmation dialog (Restart as
// administrator) and for a second quit request while the shutdown runs, which must not start a
// second shutdown. A cancelled confirmation prevents the quit and starts nothing.
import { describe, expect, it, vi } from 'vitest'
import { createQuitFlow } from '../src/main/sys/quit-flow'

function flow(confirm = true): {
  quit: ReturnType<typeof createQuitFlow>
  shutdown: ReturnType<typeof vi.fn>
  release: () => void
} {
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  const shutdown = vi.fn(() => held)
  const quit = createQuitFlow({ confirm: async () => confirm, shutdown })
  return { quit, shutdown, release }
}

const event = (): { preventDefault: ReturnType<typeof vi.fn> } => ({ preventDefault: vi.fn() })

describe('quit flow', () => {
  it('prevents the default quit when no confirmation is asked', async () => {
    const { quit, shutdown, release } = flow()
    quit.setNotQuitDialog()
    const e = event()
    const done = quit.onBeforeQuit(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(shutdown).toHaveBeenCalledTimes(1)
    release()
    await done
  })

  it('prevents a second quit during shutdown and does not start another shutdown', async () => {
    for (const noDialog of [true, false]) {
      const { quit, shutdown, release } = flow()
      if (noDialog) quit.setNotQuitDialog()
      const first = quit.onBeforeQuit(event())
      await Promise.resolve()
      const second = event()
      await Promise.race([quit.onBeforeQuit(second), new Promise((r) => setTimeout(r, 20))])
      expect(second.preventDefault).toHaveBeenCalled()
      expect(shutdown).toHaveBeenCalledTimes(1)
      release()
      await first
    }
  })

  it('prevents the quit and starts nothing when the confirmation is cancelled', async () => {
    const { quit, shutdown } = flow(false)
    const e = event()
    await quit.onBeforeQuit(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(shutdown).not.toHaveBeenCalled()
  })
})
