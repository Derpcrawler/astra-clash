// Noctur: the app was called Astra Clash before, with the data folder "astra-clash" (settings,
// profiles, rules, logs). On the first start after the rename, its entries move into Noctur's data
// folder. Only fs and path are used here, so this can run before any other module reads the data
// folder (noctur/migrate-early.ts).
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  Stats,
  writeSync
} from 'fs'
import path from 'path'

export const OLD_DATA_DIR_NAME = 'astra-clash'
const CONFIG = 'config.yaml'
/**
 * In Noctur's folder while a move is unfinished: the names Noctur's folder held before the move
 * began. Everything else in that folder came from the old one.
 */
export const RECORD = '.astra-move'
const RECORD_TMP = '.astra-move.tmp'
/** Stale copies of entries from an earlier unfinished move, replaced by newer old ones. */
export const SET_ASIDE = 'astra-move-set-aside'
const OURS = new Set([RECORD, RECORD_TMP, SET_ASIDE])

export interface MoveResult {
  moved: string[]
  /** Entries Noctur already had before the move: they stay, and the old ones stay in the old folder. */
  kept: string[]
  /** Entries that could not be moved. */
  failed: string[]
  /** Why the move did not start or could not finish, if so. */
  error?: string
  /**
   * The move is unfinished: what had moved was put back, and this start must use the old folder as
   * its data folder, so Noctur never writes its own settings next to half-moved ones. The next
   * start tries again.
   */
  useOldDir: boolean
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p)
  } catch {
    return null
  }
}

/** The record's names, null when there is no record; throws when it exists but cannot be read. */
function readRecord(dir: string): string[] | null {
  const file = path.join(dir, RECORD)
  if (!lstatOrNull(file)) return null
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(data?.noctur) || !data.noctur.every((e: unknown) => typeof e === 'string')) {
    throw new Error('the record of the unfinished move is not valid')
  }
  return data.noctur
}

/** Written to a temporary file, flushed, then renamed over the record: a crash leaves either one. */
function writeRecord(dir: string, noctur: string[]): void {
  const tmp = path.join(dir, RECORD_TMP)
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, JSON.stringify({ noctur }))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path.join(dir, RECORD))
}

/**
 * Noctur's folder, created or checked before anything moves into it: a real folder (not a link),
 * owned by this user and closed to others, so the old folder's private files are never readable
 * on the way. Returns why it is not usable, or null.
 */
function preparePrivateDir(dir: string): string | null {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (process.platform === 'win32') return null
  const st = lstatSync(dir)
  if (!st.isDirectory()) return `${dir} is not a folder`
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
    return `${dir} belongs to another user`
  }
  if ((st.mode & 0o077) !== 0) chmodSync(dir, 0o700)
  return null
}

/**
 * Puts back into the old folder everything in Noctur's folder that came from it (all but the
 * recorded names), so the old folder is whole again. Returns the entries that could not go back.
 */
function putBack(oldDir: string, newDir: string, noctur: string[]): string[] {
  const stuck: string[] = []
  for (const entry of readdirSync(newDir)) {
    if (OURS.has(entry) || noctur.includes(entry)) continue
    if (lstatOrNull(path.join(oldDir, entry))) {
      stuck.push(entry)
      continue
    }
    try {
      renameSync(path.join(newDir, entry), path.join(oldDir, entry))
    } catch {
      stuck.push(entry)
    }
  }
  return stuck
}

/**
 * Moves the old data folder's entries into the new one. Runs when the old folder has a config and
 * the new one has none, so it never replaces settings Noctur has.
 *
 * Before anything moves, a record of what Noctur's folder already holds is written (atomically);
 * those entries stay, and the old ones stay in the old folder (kept). The config moves last. If an
 * entry cannot be moved, everything that moved goes back and the result says to use the old folder
 * for this start (useOldDir), so Noctur keeps working on the user's data and writes nothing into
 * its own folder until the move is complete; the next start tries again. A move interrupted by a
 * crash leaves the record, and the next start continues it. A record that exists but cannot be
 * read is treated as listing nothing (see move()).
 */
export function moveOldDataDir(oldDir: string, newDir: string): MoveResult | null {
  if (!existsSync(path.join(oldDir, CONFIG))) return null
  if (lstatOrNull(path.join(newDir, CONFIG))) {
    // Settings of Noctur's own, or a move that finished just before its record was removed.
    if (lstatOrNull(path.join(newDir, RECORD))) rmSync(path.join(newDir, RECORD), { force: true })
    return null
  }

  const result: MoveResult = { moved: [], kept: [], failed: [], useOldDir: true }
  try {
    return move(oldDir, newDir, result)
  } catch (e) {
    // Anything unexpected: the old folder stays in use, and whatever moved goes back if it can.
    result.error = e instanceof Error ? e.message : String(e)
    let noctur: string[] | null = null
    try {
      noctur = readRecord(newDir)
    } catch {
      noctur = [] // see move(): everything there came from the old folder
    }
    try {
      if (noctur) putBack(oldDir, newDir, noctur)
    } catch {
      // what could not go back is retried on the next start
    }
    return result
  }
}

function move(oldDir: string, newDir: string, result: MoveResult): MoveResult {
  const unsafe = preparePrivateDir(newDir)
  if (unsafe) {
    result.error = unsafe
    return result
  }
  let noctur: string[] | null
  try {
    noctur = readRecord(newDir)
  } catch (e) {
    // A record that exists but cannot be read (a damaged disk; it is replaced atomically) still
    // means a move is under way. Noctur writes nothing into its folder before the move completes,
    // so everything there came from the old folder: continue on that basis, and say so.
    result.error = `${path.join(newDir, RECORD)}: ${e instanceof Error ? e.message : e}`
    noctur = []
    writeRecord(newDir, noctur)
  }
  if (!noctur) {
    noctur = readdirSync(newDir).filter((e) => !OURS.has(e))
    try {
      writeRecord(newDir, noctur)
    } catch (e) {
      rmSync(path.join(newDir, RECORD_TMP), { force: true })
      result.error = `could not write ${RECORD}: ${e instanceof Error ? e.message : e}`
      return result
    }
  }

  const entries = readdirSync(oldDir).sort((a, b) => Number(a === CONFIG) - Number(b === CONFIG))
  for (const entry of entries) {
    const from = path.join(oldDir, entry)
    const to = path.join(newDir, entry)
    try {
      if (lstatOrNull(to)) {
        if (noctur.includes(entry) || OURS.has(entry)) {
          result.kept.push(entry)
          continue
        }
        // A copy from an earlier unfinished move that could not go back; the old folder's entry
        // is the one Noctur used since. Keep the copy aside.
        const aside = path.join(newDir, SET_ASIDE)
        mkdirSync(aside, { recursive: true, mode: 0o700 })
        renameSync(to, path.join(aside, `${entry}.${Date.now()}`))
      }
      renameSync(from, to)
      result.moved.push(entry)
    } catch (e) {
      result.failed.push(entry)
      result.error = `could not move ${entry}: ${e instanceof Error ? e.message : e}`
      break
    }
  }

  if (result.failed.length > 0) {
    const stuck = putBack(oldDir, newDir, noctur)
    if (stuck.length > 0) result.error += `; could not put back ${stuck.join(', ')}`
    return result
  }

  result.useOldDir = false
  rmSync(path.join(newDir, RECORD), { force: true })
  rmSync(path.join(newDir, RECORD_TMP), { force: true })
  if (result.kept.length === 0) {
    try {
      rmdirSync(oldDir)
    } catch {
      // not empty after all (written to meanwhile): leave it
    }
  }
  return result
}

/**
 * Linux autostart: Astra Clash's entry in ~/.config/autostart is removed. Returns whether there was
 * one, so the caller can turn on Noctur's autostart in its place.
 */
export function takeOldLinuxAutostart(home: string): boolean {
  const file = path.join(home, '.config', 'autostart', `${OLD_DATA_DIR_NAME}.desktop`)
  if (!existsSync(file)) return false
  rmSync(file, { force: true })
  return true
}
