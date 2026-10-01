// Astra Clash: the folder for the core's control socket on Linux. mihomo makes that socket readable
// and writable by everyone (mode 0666) and does not ask for a secret, so the folder around it is the
// only thing that keeps other users of the machine out. A folder qualifies when:
// - its path has no symlinks, and every folder above it is owned by root or this user, with any
//   folder that others can write to having the sticky bit (as /tmp does), so nobody else can
//   rename it away and put another folder in its place;
// - it is owned by this user with no group or other access;
// - the longest socket path in it fits the 108-byte limit of a Unix socket address.
// Checked on every use, not once, so a folder replaced later is not trusted.
// The last candidate (<temp>/astra-clash-<uid>) has a predictable name: another user can create it
// first, and then it is refused as theirs. That can only stop the core from starting, and only when
// the runtime and data-folder candidates are both unusable; it cannot redirect the socket.
import { chmodSync, lstatSync, mkdirSync, realpathSync, rmSync, Stats } from 'fs'
import path from 'path'

/** Longest file name placed in the folder; the full path must stay below 108 bytes. */
export const LONGEST_SOCKET_NAME = 'astra-clash-mihomo-external.sock'
const SOCKET_NAMES = ['astra-clash-mihomo-api.sock', LONGEST_SOCKET_NAME]
const MAX_SOCKET_PATH_BYTES = 107

export interface SocketDirCandidate {
  dir: string | undefined
  /** Create the folder (0700) when it does not exist. */
  create: boolean
}

function safeAncestor(st: Stats, uid: number): boolean {
  if (!st.isDirectory()) return false
  if (st.uid !== 0 && st.uid !== uid) return false
  const writableByOthers = (st.mode & 0o022) !== 0
  const sticky = (st.mode & 0o1000) !== 0
  return !writableByOthers || sticky
}

/**
 * Why `dir` cannot hold the socket, or null when it can. A folder we create may be created, set to
 * 0700 and have stray entries at the socket names removed; a runtime folder given to us is never
 * changed.
 */
function rejectReason(candidate: SocketDirCandidate, uid: number): string | null {
  const dir = candidate.dir
  if (!dir || !path.isAbsolute(dir)) return 'not an absolute path'
  const resolved = path.resolve(dir)
  if (Buffer.byteLength(path.join(resolved, LONGEST_SOCKET_NAME)) > MAX_SOCKET_PATH_BYTES) {
    return 'path too long for a socket'
  }
  // Every folder above it, from the root down.
  const parts = resolved.split(path.sep).filter(Boolean)
  let current: string = path.sep
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part)
    let st: Stats
    try {
      st = lstatSync(current)
    } catch {
      return `${current} is missing`
    }
    if (st.isSymbolicLink()) return `${current} is a symlink`
    if (!safeAncestor(st, uid)) return `${current} can be changed by other users`
  }
  let st: Stats
  try {
    st = lstatSync(resolved)
  } catch {
    if (!candidate.create) return 'missing'
    try {
      mkdirSync(resolved, { mode: 0o700 })
      st = lstatSync(resolved)
    } catch (error) {
      return `cannot create it: ${error}`
    }
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return 'not a folder'
  if (st.uid !== uid) return 'owned by another user'
  try {
    if (realpathSync(resolved) !== resolved) return 'path resolves elsewhere'
  } catch (error) {
    return `cannot resolve it: ${error}`
  }
  if ((st.mode & 0o077) !== 0) {
    // A runtime folder given to us is not changed. Our own folder that was open to others is set to
    // 0700 first (after that nobody else can add anything), then whatever sits at the socket names
    // and is not a socket of ours is removed: someone may have put a symlink there. Our own live
    // socket stays, so a core that is running keeps working.
    if (!candidate.create) return 'open to other users'
    try {
      chmodSync(resolved, 0o700)
      for (const name of SOCKET_NAMES) {
        const entry = path.join(resolved, name)
        let es: Stats
        try {
          es = lstatSync(entry)
        } catch {
          continue
        }
        if (!(es.isSocket() && es.uid === uid)) rmSync(entry, { recursive: true, force: true })
      }
    } catch (error) {
      return `cannot make it private: ${error}`
    }
  }
  return null
}

function advice(reason: string, dir: string | undefined): string {
  if (!dir) return 'log in through a desktop session so XDG_RUNTIME_DIR is set, usually /run/user/<your user id>'
  if (reason === 'path too long for a socket') {
    return 'set XDG_RUNTIME_DIR or TMPDIR to a shorter folder that only you can open'
  }
  if (reason === 'open to other users') return `run: chmod 700 "${dir}"`
  if (reason.endsWith('can be changed by other users')) {
    const folder = reason.slice(0, -' can be changed by other users'.length)
    return `remove write access for others, for example: chmod go-w "${folder}"`
  }
  if (reason === 'owned by another user') return `remove "${dir}" or ask its owner to remove it`
  return 'set XDG_RUNTIME_DIR to a folder that only you can open'
}

/** The first candidate that qualifies; throws with each candidate's reason and a fix when none does. */
export function privateSocketDir(candidates: SocketDirCandidate[], uid: number): string {
  const reasons: string[] = []
  for (const candidate of candidates) {
    const reason = rejectReason(candidate, uid)
    if (reason === null) return path.resolve(candidate.dir as string)
    const where = candidate.dir ? `${candidate.dir}: ${reason}` : 'XDG_RUNTIME_DIR is not set'
    reasons.push(`${where} (to fix: ${advice(reason, candidate.dir)})`)
  }
  throw new Error(
    `No private folder for the core's control socket. ${reasons.join('; ')}. Then start the app again.`
  )
}
