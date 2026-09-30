// Astra Clash: whether the app is really shutting down. Set only once a quit is accepted (after the
// confirmation, or without one), right before the core is stopped, and never cleared. Work that
// must not run during shutdown, such as wake recovery, checks it. A cancelled quit prompt leaves it
// unset.
let shuttingDown = false

export function beginShutdown(): void {
  shuttingDown = true
}

export function isShuttingDown(): boolean {
  return shuttingDown
}
