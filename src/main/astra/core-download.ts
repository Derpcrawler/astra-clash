// Astra Clash: download a newer mihomo core without updating the app.
//
// The download is checked against the SHA-256 digest GitHub publishes for the release asset, then
// copied into a root-owned folder and given the setuid bit in one administrator prompt, the same
// rights the built-in core gets from the installer. While `downloadedCore` is set in the app
// config, mihomoCorePath('mihomo') points at it (utils/dirs.ts), so the rest of the app is unchanged.

import axios, { AxiosRequestConfig } from 'axios'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { chmod, mkdir, readdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import { gunzipSync } from 'zlib'
import { getAppConfig, getControledMihomoConfig, patchAppConfig } from '../config'
import { ASTRA_CORE_DIR as CORE_DIR, dataDir, mihomoCoreDir } from '../utils/dirs'
import { restartCore } from '../core/manager'

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

// Requests go through the local mixed port when it is open, since GitHub may be blocked directly.
async function requestConfig(): Promise<AxiosRequestConfig> {
  const { 'mixed-port': port = 0 } = await getControledMihomoConfig()
  return port
    ? { proxy: { protocol: 'http', host: '127.0.0.1', port }, timeout: 30_000 }
    : { timeout: 30_000 }
}

export async function latestCore(): Promise<CoreRelease> {
  const cfg = await requestConfig()
  const res = await axios.get(RELEASE_API, { ...cfg, headers: { Accept: 'application/vnd.github+json' } })
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
  const script = `do shell script "${shell.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with administrator privileges`
  await execFileP('osascript', ['-e', script])
}

export async function downloadCore(): Promise<string> {
  const release = await latestCore()
  const cfg = await requestConfig()
  const res = await axios.get(release.url, { ...cfg, responseType: 'arraybuffer', timeout: 120_000 })
  const gz = Buffer.from(res.data)
  const actual = createHash('sha256').update(gz).digest('hex')
  if (actual !== release.sha256) {
    throw new Error(`SHA-256 mismatch for ${release.asset}: got ${actual}, GitHub lists ${release.sha256}`)
  }

  const tmpDir = path.join(dataDir(), 'tmp')
  await mkdir(tmpDir, { recursive: true })
  const tmp = path.join(tmpDir, `mihomo-${release.version}`)
  await writeFile(tmp, gunzipSync(gz))
  await chmod(tmp, 0o755)
  try {
    // Refuse a binary that does not run or does not report the expected version.
    const { stdout } = await execFileP(tmp, ['-v'], { timeout: 10_000 })
    if (!stdout.includes(release.version)) throw new Error(`Downloaded core reports: ${stdout.trim()}`)

    const target = path.join(CORE_DIR, `mihomo-${release.version}`)
    await asAdmin(
      `mkdir -p '${CORE_DIR}' && chown root:wheel '${CORE_DIR}' && chmod 755 '${CORE_DIR}' && ` +
        `cp '${tmp}' '${target}' && chown root:admin '${target}' && chmod 4755 '${target}'`
    )
  } finally {
    await rm(tmp, { force: true })
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
