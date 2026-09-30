// Astra Clash: waiting for the core's providers to start, after a core start and after every hot
// reload. The core logs "Start initial provider <name>" for each rule and proxy provider (or
// "Start initial compatible provider default" when there are none).
//
// Every arm() creates its own wait with its own handle. Waits run side by side, so overlapping
// reloads each keep theirs, and a handle's cancel() ends only that wait: a reload that fails after
// a newer one started cannot cancel the newer wait. A wait settles once: resolved when all its
// providers have started and the API answers, rejected on a TUN permission error, its own cancel(),
// or when the core stops or exits (cancelAll, failAll). After timeoutMs without the lines it asks
// the API instead, so a change in log wording cannot leave a wait open.

export class ProviderWaitCancelled extends Error {
  constructor() {
    super('Provider wait cancelled')
  }
}

export interface ProviderTrackerDeps {
  normalize: (s: string) => string
  /** Resolves once the core's API answers; rejects if it never does. */
  waitForApi: () => Promise<void>
  /** Returns the reason the wait rejects with. */
  onTunPermissionError: () => unknown
  timeoutMs: number
}

export interface ProviderWait {
  ready: Promise<void>
  /** Ends this wait only; does nothing once it has settled. */
  cancel: () => void
}

interface Wait {
  names: Set<string>
  unmatched: Set<string>
  settled: boolean
  checking: boolean
  timer?: NodeJS.Timeout
  resolve: () => void
  reject: (e: unknown) => void
}

export class ProviderTracker {
  private readonly waits = new Set<Wait>()

  constructor(private readonly d: ProviderTrackerDeps) {}

  arm(names: Set<string>): ProviderWait {
    let wait!: Wait
    const ready = new Promise<void>((resolve, reject) => {
      wait = { names, unmatched: new Set(names), settled: false, checking: false, resolve, reject }
    })
    // Callers that ignore a cancelled wait must not produce unhandled rejection reports.
    ready.catch(() => {})
    wait.timer = setTimeout(() => this.checkApi(wait), this.d.timeoutMs)
    this.waits.add(wait)
    return { ready, cancel: () => this.settle(wait, { error: new ProviderWaitCancelled() }) }
  }

  feed(line: string): void {
    const tunDenied = line.includes(
      'Start TUN listening error: configure tun interface: Connect: operation not permitted'
    )
    const started = [...line.matchAll(/Start initial provider ([^"]+)"/g)].map((m) => this.d.normalize(m[1]))
    const defaultLine = line.includes('Start initial compatible provider default')
    let tunReason: unknown
    let tunReported = false
    for (const wait of [...this.waits]) {
      if (tunDenied) {
        if (!tunReported) {
          tunReason = this.d.onTunPermissionError()
          tunReported = true
        }
        this.settle(wait, { error: tunReason })
        continue
      }
      for (const name of started) wait.unmatched.delete(name)
      const defaultOnly = wait.names.size === 0 && defaultLine
      const allMatched = wait.names.size > 0 && wait.unmatched.size === 0
      if (defaultOnly || allMatched) this.checkApi(wait)
    }
  }

  /** Ends every wait with this reason, for example when the core exits. */
  failAll(reason: unknown): void {
    for (const wait of [...this.waits]) this.settle(wait, { error: reason })
  }

  /** Ends every wait without an error to report (deliberate stop). */
  cancelAll(): void {
    for (const wait of [...this.waits]) this.settle(wait, { error: new ProviderWaitCancelled() })
  }

  private checkApi(wait: Wait): void {
    if (wait.settled || wait.checking) return
    wait.checking = true
    this.d.waitForApi().then(
      () => this.settle(wait, null),
      (e) => this.settle(wait, { error: e })
    )
  }

  /** result null resolves the wait; { error } rejects it with that error. */
  private settle(wait: Wait, result: { error: unknown } | null): void {
    if (wait.settled) return
    wait.settled = true
    if (wait.timer) clearTimeout(wait.timer)
    this.waits.delete(wait)
    if (result === null) wait.resolve()
    else wait.reject(result.error)
  }
}
