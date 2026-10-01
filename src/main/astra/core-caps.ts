// Astra Clash: on Linux the core gets TUN rights as file capabilities instead of setuid root:
// CAP_NET_ADMIN for the TUN device and routes, CAP_NET_BIND_SERVICE for DNS on port 53. The core
// then runs as the user, and a user who starts it with their own config gets no root access.
// The packages set the same capabilities at install time (build/linux/postinst).
import { execFile, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'

export const CORE_CAPS = 'cap_net_admin,cap_net_bind_service=+ep'

const execFilePromise = promisify(execFile)

// getcap and setcap live in /usr/sbin on Debian and Fedora, /usr/bin on Arch; /usr/sbin is not on a
// normal user's PATH on Debian.
function capTool(name: 'getcap' | 'setcap'): string {
  for (const dir of ['/usr/sbin', '/usr/bin', '/sbin', '/bin']) {
    const file = `${dir}/${name}`
    if (existsSync(file)) return file
  }
  throw new Error(`${name} not found; install libcap (Debian and Ubuntu: libcap2-bin)`)
}

// getcap prints "<path> cap_net_admin,cap_net_bind_service=ep" (older versions: "<path> = ...+ep").
// Only the part after the path is read, so a path containing a capability name cannot match.
export function parseCoreCaps(output: string, corePath: string): boolean {
  const line = output.split('\n').find((l) => l.startsWith(corePath))
  if (!line) return false
  const caps = line.slice(corePath.length)
  // The core does not raise capabilities itself, so they must be effective (e) as well as permitted (p).
  const flags = /[=+]([eip]+)\s*$/.exec(caps)?.[1] ?? ''
  return (
    /\bcap_net_admin\b/.test(caps) &&
    /\bcap_net_bind_service\b/.test(caps) &&
    flags.includes('e') &&
    flags.includes('p')
  )
}

/**
 * full: both capabilities, effective and permitted (TUN works). partial: some capability set, but
 * not that (still something to remove). none: no capability set on the file.
 */
export type CapsState = 'full' | 'partial' | 'none'

export function parseCapsState(output: string, corePath: string): CapsState {
  const line = output.split('\n').find((l) => l.startsWith(corePath))
  if (!line || line.slice(corePath.length).trim() === '') return 'none'
  return parseCoreCaps(output, corePath) ? 'full' : 'partial'
}

/** Throws when the capabilities cannot be read (getcap missing, file unreadable). */
export async function readCapsState(corePath: string): Promise<CapsState> {
  const { stdout } = await execFilePromise(capTool('getcap'), [corePath])
  return parseCapsState(stdout, corePath)
}

export async function hasCoreCaps(corePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFilePromise(capTool('getcap'), [corePath])
    return parseCoreCaps(stdout, corePath)
  } catch {
    return false
  }
}

export function hasCoreCapsSync(corePath: string): boolean {
  try {
    return parseCoreCaps(execFileSync(capTool('getcap'), [corePath], { encoding: 'utf8' }), corePath)
  } catch {
    return false
  }
}

// One pkexec call for all cores, so the user sees one password prompt. setcap takes several
// "<caps> <file>" pairs; "-r <file>" removes them.
export function setCoreCapsArgs(corePaths: string[], grant: boolean): string[] {
  return [capTool('setcap'), ...corePaths.flatMap((p) => (grant ? [CORE_CAPS, p] : ['-r', p]))]
}

export async function setCoreCaps(corePaths: string[], grant: boolean): Promise<void> {
  const present = corePaths.filter((p) => existsSync(p))
  if (present.length === 0) return
  await execFilePromise('pkexec', setCoreCapsArgs(present, grant))
}

// pkexec exits with 126 when the password dialog is dismissed.
export function isPkexecCancel(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 126
}
