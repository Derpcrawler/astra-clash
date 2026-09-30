// Astra Clash: reading the core's startup log. The core reports on stdout when its controller is
// listening. Output arrives in chunks that can hold several lines or part of one, so lines are
// split here and every line goes through one reader in order, from the first byte. Lines after
// the controller line go to onLine (provider tracking, core/provider-tracker.ts), for as long as
// the core runs, so hot reloads are seen too.
//
// The controller phase is bounded from the moment the watcher is attached: without the controller
// line within startupTimeoutMs the API is asked instead, so a silent or hanging core, or a changed
// log wording, cannot leave startup waiting. A spawn error or an exit settles it at once.

import { EventEmitter } from 'events'

export interface StartupChild extends EventEmitter {
  stdout: EventEmitter | null
}

export interface StartupWatchOptions {
  platform: NodeJS.Platform
  /** Deadline for the controller line, counted from attaching the watcher. */
  startupTimeoutMs: number
  /** Resolves once the core's API answers; rejects if it never does. */
  waitForApi: () => Promise<void>
  /** Windows: the core finished updating itself and must be restarted. */
  onUpdaterFinished: () => void
  /** Every line after the controller line. */
  onLine: (line: string) => void
  /** The core exited or failed to spawn; called once. */
  onEnd: (reason: Error) => void
}

export interface StartupWatch {
  /** Resolves when the controller listens (or, after the deadline, when the API answers);
   *  rejects on a listen error, a spawn error, an exit, or an API that does not answer. */
  controller: Promise<void>
  /** Detaches the watcher and clears its timer (deliberate stop). */
  stop: () => void
}

export class LineSplitter {
  private rest = ''
  constructor(private readonly onLine: (line: string) => void) {}
  push(chunk: string): void {
    const parts = (this.rest + chunk).split(/\r?\n/)
    this.rest = parts.pop() ?? ''
    for (const line of parts) this.onLine(line)
  }
  flush(): void {
    if (this.rest) this.onLine(this.rest)
    this.rest = ''
  }
}

export function watchStartup(child: StartupChild, o: StartupWatchOptions): StartupWatch {
  let resolveController!: () => void
  let rejectController!: (e: unknown) => void
  const controller = new Promise<void>((res, rej) => {
    resolveController = res
    rejectController = rej
  })
  controller.catch(() => {})

  let controllerSettled = false
  let ended = false
  let checking = false

  const win = o.platform === 'win32'
  const listenError = win ? 'External controller pipe listen error' : 'External controller unix listen error'
  const listening = win ? 'RESTful API pipe listening at' : 'RESTful API unix listening at'

  const settleController = (err?: unknown): void => {
    if (controllerSettled) return
    controllerSettled = true
    clearTimeout(timer)
    if (err === undefined) resolveController()
    else rejectController(err)
  }

  const onLine = (line: string): void => {
    if (!controllerSettled) {
      if (line.includes(listenError)) {
        settleController(line)
        return
      }
      if (win && line.includes('updater: finished')) o.onUpdaterFinished()
      if (line.includes(listening)) settleController()
      return
    }
    o.onLine(line)
  }

  const lines = new LineSplitter(onLine)
  const onData = (d: Buffer | string): void => lines.push(d.toString())

  const detach = (): void => {
    clearTimeout(timer)
    child.stdout?.removeListener('data', onData)
    child.removeListener('exit', onExit)
    child.removeListener('error', onError)
  }

  const end = (reason: Error): void => {
    if (ended) return
    ended = true
    lines.flush()
    detach()
    settleController(reason)
    o.onEnd(reason)
  }
  const onExit = (code: number | null, signal: string | null): void =>
    end(new Error(`Core exited (code ${code}, signal ${signal})`))
  const onError = (e: Error): void => end(e instanceof Error ? e : new Error(String(e)))

  const timer = setTimeout(() => {
    if (controllerSettled || checking) return
    checking = true
    o.waitForApi().then(
      () => settleController(),
      (e) => settleController(e)
    )
  }, o.startupTimeoutMs)

  child.stdout?.on('data', onData)
  child.once('exit', onExit)
  child.on('error', onError)

  return {
    controller,
    stop: () => {
      ended = true
      detach()
      settleController(new Error('Core stopped during startup'))
    }
  }
}
