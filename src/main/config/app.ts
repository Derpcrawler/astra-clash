import { readFile, writeFile, rename, copyFile, unlink, chmod } from 'fs/promises'
import { appConfigPath } from '../utils/dirs'
import { parseYaml, stringifyYaml } from '../utils/yaml'
import { deepMerge } from '../utils/merge'
import { defaultConfig } from '../utils/template'
import { readFileSync, existsSync, chmodSync } from 'fs'
import { encryptString, decryptString, isEncrypted } from '../utils/encrypt'
import { FORK } from '../fork'

let appConfig: AppConfig
let writePromise: Promise<void> = Promise.resolve()

const ENCRYPTED_FIELDS = ['systemCorePath', 'serviceAuthKey'] as const

function isValidConfig(config: unknown): config is AppConfig {
  if (!config || typeof config !== 'object') return false
  const cfg = config as Partial<AppConfig>
  return 'sysProxy' in cfg && typeof cfg.sysProxy === 'object' && cfg.sysProxy !== null
}

// Astra Clash: the config holds the service's private signing key (serviceAuthKey) as plain text,
// since the keychain is not used, so the config and its temp and backup files are owner-only.
const OWNER_ONLY = 0o600

async function ownerOnly(file: string): Promise<void> {
  if (process.platform === 'win32' || !existsSync(file)) return
  await chmod(file, OWNER_ONLY).catch(() => {})
}

function ownerOnlySync(file: string): void {
  if (process.platform === 'win32' || !existsSync(file)) return
  try {
    chmodSync(file, OWNER_ONLY)
  } catch {
    // ignore
  }
}

// Astra Clash: a config file counts only when it reads, parses and has the expected shape. Any
// failure (unreadable, bad YAML, wrong shape) falls through to the backup, then to defaults.
function parseValid(text: string): AppConfig | null {
  try {
    const parsed = parseYaml<AppConfig>(text)
    return isValidConfig(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function readValid(file: string): Promise<AppConfig | null> {
  try {
    return parseValid(await readFile(file, 'utf-8'))
  } catch {
    return null
  }
}

function readValidSync(file: string): AppConfig | null {
  try {
    return parseValid(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

// deepMerge changes its target, so the shared defaults are never used directly.
function freshDefaults(): AppConfig {
  return JSON.parse(JSON.stringify(defaultConfig)) as AppConfig
}

async function safeWriteConfig(content: string): Promise<void> {
  const configPath = appConfigPath()
  const tmpPath = `${configPath}.tmp`
  const backupPath = `${configPath}.backup`

  try {
    await writeFile(tmpPath, content, { encoding: 'utf-8', mode: OWNER_ONLY })
    // mode applies only when the file is created; a leftover temp file keeps its old mode.
    await ownerOnly(tmpPath)
    if (existsSync(configPath)) {
      // Astra Clash: the current file becomes the backup only when it is a valid config, so a
      // corrupt file never replaces the last good backup.
      if (await readValid(configPath)) {
        await copyFile(configPath, backupPath)
        await ownerOnly(backupPath)
      }
      if (process.platform === 'win32') {
        await unlink(configPath)
      }
    }
    if (existsSync(tmpPath)) {
      await rename(tmpPath, configPath)
    }
  } catch (e) {
    if (existsSync(tmpPath)) {
      try {
        await unlink(tmpPath)
      } catch {
        // ignore
      }
    }
    throw e
  }
}

function decryptConfig(config: AppConfig): AppConfig {
  const result = { ...config }

  // Astra Clash: no keychain. Values are plain text; old encrypted ones cannot be read and are cleared.
  if (!FORK.keychain) {
    for (const field of ENCRYPTED_FIELDS) {
      const value = result[field]
      if (typeof value === 'string' && isEncrypted(value)) (result[field] as string) = ''
    }
    return result
  }

  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field]
    if (value && typeof value === 'string') {
      if (!isEncrypted(value)) {
        ;(result[field] as string) = ''
      } else {
        ;(result[field] as string) = decryptString(value)
      }
    }
  }

  return result
}

function encryptConfig(config: AppConfig): AppConfig {
  const result = { ...config }
  if (!FORK.keychain) return result

  for (const field of ENCRYPTED_FIELDS) {
    const value = result[field]
    if (value && typeof value === 'string') {
      ;(result[field] as string) = encryptString(value)
    }
  }

  return result
}

export async function getAppConfig(force = false): Promise<AppConfig> {
  if (force || !appConfig) {
    const configPath = appConfigPath()
    // Existing files with wider modes are tightened on load.
    await ownerOnly(configPath)
    await ownerOnly(`${configPath}.backup`)
    const loaded = (await readValid(configPath)) ?? (await readValid(`${configPath}.backup`))
    appConfig = loaded ? decryptConfig(loaded) : freshDefaults()
  }
  if (typeof appConfig !== 'object') appConfig = freshDefaults()
  return appConfig
}

export async function patchAppConfig(patch: Partial<AppConfig>): Promise<void> {
  const previousPromise = writePromise
  const currentPromise = (async () => {
    await previousPromise
    appConfig = deepMerge(appConfig, patch)
    await safeWriteConfig(stringifyYaml(encryptConfig(appConfig)))
  })()
  // The queue keeps going after a failed write; only this caller gets the error.
  writePromise = currentPromise.catch(() => {})
  await currentPromise
}

let tightenedSync = false

export function getAppConfigSync(): AppConfig {
  const configPath = appConfigPath()
  if (!tightenedSync) {
    ownerOnlySync(configPath)
    ownerOnlySync(`${configPath}.backup`)
    tightenedSync = true
  }
  const loaded = readValidSync(configPath) ?? readValidSync(`${configPath}.backup`)
  return loaded ? decryptConfig(loaded) : freshDefaults()
}
