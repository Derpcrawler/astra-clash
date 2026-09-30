// Astra Clash: download a newer mihomo core without updating the app.
//
// The download is checked against the SHA-256 digest GitHub publishes for the release asset. The
// administrator step (astra/core-install.ts) then copies it into a root-owned folder, checks the
// digest of that copy again and gives it the setuid bit, the same rights the built-in core gets from
// the installer. While `downloadedCore` is set in the app
// config, mihomoCorePath('mihomo') points at it (utils/dirs.ts), so the rest of the app is unchanged.

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import { gunzipSync } from 'zlib'
import { getAppConfig, patchAppConfig } from '../config'
import { ASTRA_CORE_DIR as CORE_DIR, dataDir, mihomoCoreDir } from '../utils/dirs'
import { hasCoreProcess, restartCore } from '../core/manager'
import { getRuntimeConfig } from '../core/factory'
import { describeInstallFailure, installScript, osascriptArgs } from './core-install'

const execFileP = promisify(execFile)
const RELEASE_API = 'https://api.github.com/repos/MetaCubeX/mihomo/releases/latest'
const TAG_RE = /^v\d+\.\d+\.\d+$/

export interface CoreRelease {
  version: string
  asset: string
  url: string
  sha256: string
  size: number
}

export interface CoreState {
  // Version tag of the downloaded core in use, or null for the built-in one.
  active: string | null
  // Downloaded versions present in CORE_DIR.
  installed: string[]
  // Version of the core shipped inside the app.
  builtIn: string | null
}

function assetName(tag: string): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64-v1'
  return `mihomo-darwin-${arch}-${tag}.gz`
}

// Requests go through the local mixed port when the core is listening on it, since GitHub may be
// blocked directly. The port comes from the config the core runs with: while disconnected the app
// starts the core with its proxy ports set to 0, whatever the saved mixed-port says.
async function requestConfig(): Promise<AxiosRequestConfig> {
  const runtime = hasCoreProcess() ? await getRuntimeConfig().catch(() => undefined) : undefined
  const port = Number(runtime?.['mixed-port'] ?? 0)
  return port > 0
    ? { proxy: { protocol: 'http', host: '127.0.0.1', port }, timeout: 30_000 }
    : { timeout: 30_000 }
}

// A GET through the local proxy when there is one. If the local listener refuses the connection
// (for example while the core restarts), the request is repeated once without the proxy; any
// other error is reported as it is.
export async function fetchGitHub<T = unknown>(url: string, extra: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
  const cfg = await requestConfig()
  try {
    return await axios.get<T>(url, { ...cfg, ...extra })
  } catch (e) {
    if (cfg.proxy && (e as { code?: string }).code === 'ECONNREFUSED') {
      return await axios.get<T>(url, { timeout: 30_000, ...extra })
    }
    throw e
  }
}

export async function latestCore(): Promise<CoreRelease> {
  const res = await fetchGitHub<{ tag_name: string; assets: unknown }>(RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  const tag: string = res.data.tag_name
  if (!TAG_RE.test(tag)) throw new Error(`Unexpected release tag: ${tag}`)
  const name = assetName(tag)
  const asset = (res.data.assets as { name: string; browser_download_url: string; digest?: string; size: number }[]).find(
    (a) => a.name === name
  )
  if (!asset) throw new Error(`No ${name} in the ${tag} release`)
  const sha256 = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7).toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`The ${tag} release publishes no SHA-256 for ${name}`)
  return { version: tag, asset: name, url: asset.browser_download_url, sha256, size: asset.size }
}

export async function coreState(): Promise<CoreState> {
  const installed = existsSync(CORE_DIR)
    ? (await readdir(CORE_DIR))
        .filter((f) => f.startsWith('mihomo-v'))
        .map((f) => f.slice('mihomo-'.length))
        .filter((v) => TAG_RE.test(v))
    : []
  const { downloadedCore } = await getAppConfig()
  let builtIn: string | null = null
  try {
    const { stdout } = await execFileP(path.join(mihomoCoreDir(), 'mihomo'), ['-v'], { timeout: 10_000 })
    builtIn = stdout.match(/v\d+\.\d+\.\d+/)?.[0] ?? null
  } catch {
    // leave unknown
  }
  return { active: downloadedCore && installed.includes(downloadedCore) ? downloadedCore : null, installed, builtIn }
}

async function asAdmin(shell: string): Promise<void> {
  await execFileP('osascript', osascriptArgs(shell, true))
}

// osascript reports the shell's exit status at the end of its message, for example "(4)".
function exitCodeOf(error: unknown): number | undefined {
  const m = String((error as { stderr?: string })?.stderr ?? error).match(/\((-?\d+)\)\s*$/)
  return m ? Number(m[1]) : undefined
}

// One download at a time: a second click while the first waits for the password is refused.
let downloading = false

export async function downloadCore(): Promise<string> {
  if (downloading) throw new Error('A core download is already running')
  downloading = true
  try {
    return await downloadAndInstall()
  } finally {
    downloading = false
  }
}

async function downloadAndInstall(): Promise<string> {
  const release = await latestCore()
  const res = await fetchGitHub<ArrayBuffer>(release.url, { responseType: 'arraybuffer', timeout: 120_000 })
  const gz = Buffer.from(res.data)
  const actual = createHash('sha256').update(gz).digest('hex')
  if (actual !== release.sha256) {
    throw new Error(`SHA-256 mismatch for ${release.asset}: got ${actual}, GitHub lists ${release.sha256}`)
  }
  // The installer checks the file it installs against this digest of the verified bytes.
  const core = gunzipSync(gz)
  const coreSha256 = createHash('sha256').update(core).digest('hex')

  // Own folder per attempt, readable only by the user.
  const tmpRoot = path.join(dataDir(), 'tmp')
  await mkdir(tmpRoot, { recursive: true })
  const tmpDir = await mkdtemp(path.join(tmpRoot, 'core-'))
  await chmod(tmpDir, 0o700)
  const tmp = path.join(tmpDir, 'mihomo')
  await writeFile(tmp, core, { mode: 0o700 })
  try {
    // Refuse a binary that does not run or does not report the expected version.
    const { stdout } = await execFileP(tmp, ['-v'], { timeout: 10_000 })
    if (!stdout.includes(release.version)) throw new Error(`Downloaded core reports: ${stdout.trim()}`)

    try {
      await asAdmin(
        installScript({
          source: tmp,
          sha256: coreSha256,
          coreDir: CORE_DIR,
          name: `mihomo-${release.version}`,
          dirOwner: 'root:wheel',
          fileOwner: 'root:admin',
          mode: '4755'
        })
      )
    } catch (e) {
      throw new Error(describeInstallFailure(exitCodeOf(e)) ?? `Installing the core failed: ${e}`)
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }

  await patchAppConfig({ downloadedCore: release.version, core: 'mihomo' })
  await restartCore()
  return release.version
}

export async function useDownloadedCore(version: string | null): Promise<void> {
  if (version !== null && !TAG_RE.test(version)) throw new Error(`Bad version: ${version}`)
  await patchAppConfig({ downloadedCore: version ?? '', ...(version ? { core: 'mihomo' as const } : {}) })
  await restartCore()
}

export async function removeCore(version: string): Promise<void> {
  if (!TAG_RE.test(version)) throw new Error(`Bad version: ${version}`)
  const { downloadedCore } = await getAppConfig()
  await asAdmin(`rm -f '${path.join(CORE_DIR, `mihomo-${version}`)}'`)
  if (downloadedCore === version) await useDownloadedCore(null)
}
