// Astra Clash: reading the core's startup log. The core reports on stdout when its controller is
// listening and when each provider starts. Output arrives in chunks that can hold several lines or
// part of one, so lines are split here and every line goes through one reader in order.

import { EventEmitter } from 'events'

export interface StartupChild extends EventEmitter {
  stdout: EventEmitter | null
}

export interface StartupWatchOptions {
  platform: NodeJS.Platform
  /** Normalized names of the profile's rule and proxy providers. */
  providerNames: Set<string>
  /** Names not seen yet; the watcher removes names as their start line appears. */
  unmatchedProviders: Set<string>
  normalize: (s: string) => string
  /** Resolves once the core's API answers; rejects if it never does. */
  waitForApi: () => Promise<void>
  /** Called for "Start TUN listening error ... operation not permitted"; returns the reason
   *  `ready` rejects with. */
  onTunPermissionError: () => unknown
  /** Windows: the core finished updating itself and must be restarted. */
  onUpdaterFinished: () => void
  /** Without the expected provider lines, stop waiting after this long and check the API. */
  readyTimeoutMs: number
}

export interface StartupWatch {
  /** Resolves when the controller listens; rejects on a listen error or an early exit. */
  controller: Promise<void>
  /** Resolves when providers have started and the API answers; rejects on a TUN permission error,
   *  an exit before that, or an API that does not answer after the timeout. */
  ready: Promise<void>
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

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  // Handled by the caller or not needed; avoid unhandled rejection reports for the other one.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

export function watchStartup(child: StartupChild, o: StartupWatchOptions): StartupWatch {
  const controller = deferred()
  const ready = deferred()
  let controllerUp = false
  let readySettled = false
  let checking = false
  let timer: NodeJS.Timeout | undefined

  const win = o.platform === 'win32'
  const listenError = win ? 'External controller pipe listen error' : 'External controller unix listen error'
  const listening = win ? 'RESTful API pipe listening at' : 'RESTful API unix listening at'

  const settleReady = (err?: unknown): void => {
    if (readySettled) return
    readySettled = true
    if (timer) clearTimeout(timer)
    if (err === undefined) ready.resolve()
    else ready.reject(err)
  }

  const becomeReady = (): void => {
    if (readySettled || checking) return
    checking = true
    o.waitForApi().then(
      () => settleReady(),
      (e) => settleReady(e)
    )
  }

  const onLine = (line: string): void => {
    if (!controllerUp) {
      if (line.includes(listenError)) {
        controller.reject(line)
        settleReady(line)
        return
      }
      if (win && line.includes('updater: finished')) o.onUpdaterFinished()
      if (line.includes(listening)) {
        controllerUp = true
        controller.resolve()
        timer = setTimeout(becomeReady, o.readyTimeoutMs)
      }
      return
    }
    if (readySettled) return
    for (const m of line.matchAll(/Start initial provider ([^"]+)"/g)) {
      o.unmatchedProviders.delete(o.normalize(m[1]))
    }
    if (line.includes('Start TUN listening error: configure tun interface: Connect: operation not permitted')) {
      settleReady(o.onTunPermissionError())
      return
    }
    const defaultOnly = o.providerNames.size === 0 && line.includes('Start initial compatible provider default')
    const allMatched = o.providerNames.size > 0 && o.unmatchedProviders.size === 0
    if (defaultOnly || allMatched) becomeReady()
  }

  const lines = new LineSplitter(onLine)
  child.stdout?.on('data', (d: Buffer | string) => lines.push(d.toString()))
  child.once('exit', (code: number | null, signal: string | null) => {
    lines.flush()
    const why = new Error(`Core exited during startup (code ${code}, signal ${signal})`)
    if (!controllerUp) controller.reject(why)
    settleReady(why)
  })

  return { controller: controller.promise, ready: ready.promise }
}
