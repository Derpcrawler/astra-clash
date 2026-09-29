import { net, powerMonitor } from 'electron'
import { writeFile } from 'fs/promises'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { hasCoreProcess, restartCore } from '../core/manager'
import { mihomoHotReloadConfig, mihomoVersion } from '../core/mihomoApi'
import { logPath } from '../utils/dirs'
import { triggerSysProxy } from './sysproxy'

// Astra Clash: recovery after the Mac wakes from sleep, ported from Mihomo Party 0e3116a. Sleep can
// leave the core running but no longer routing: TUN's DNS listener stops answering, connections to
// the proxy server are dead, and macOS can drop the system proxy settings.
//
// Mihomo Party also recreates TUN when its interface is missing. That check needs the interface
// name, and on macOS the core picks a free utunN itself, so it is left out here.

// Right after a wake the network interfaces are still coming up, so checks would fail.
const settleDelay = 3000
const networkWaitTimeout = 30000
const networkWaitInterval = 1000

let recovering = false

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function log(message: string): Promise<void> {
  await writeFile(logPath(), `[Resume]: ${message}\n`, { flag: 'a' }).catch(() => {})
}

async function waitForNetwork(): Promise<void> {
  const deadline = Date.now() + networkWaitTimeout
  while (!net.isOnline() && Date.now() < deadline) {
    await wait(networkWaitInterval)
  }
}

async function coreAnswers(): Promise<boolean> {
  try {
    await mihomoVersion()
    return true
  } catch {
    return false
  }
}

async function recoverAfterResume(): Promise<void> {
  if (recovering) return
  recovering = true
  try {
    await wait(settleDelay)
    await waitForNetwork()

    // No core process means it was stopped on purpose (quitting, or network detection stopped it
    // and will start it again), so there is nothing to recover.
    if (!hasCoreProcess()) return

    const { proxyMode = false, sysProxy, onlyActiveDevice = false } = await getAppConfig()
    const { tun } = await getControledMihomoConfig()

    if (!(await coreAnswers())) {
      await log('Core does not answer after wake, restarting it')
      await restartCore()
    } else if (tun?.enable || proxyMode) {
      // The same reload that saving DNS settings runs: the core rebuilds DNS and TUN routing and
      // closes the connections that died during sleep.
      await mihomoHotReloadConfig()
      await log('Reloaded core config after wake')
    }

    if (proxyMode && sysProxy?.enable) {
      // Sets the same values again, and retries by itself while the Mac is offline.
      await triggerSysProxy(true, onlyActiveDevice)
    }
  } catch (e) {
    await log(`Recovery after wake failed: ${e}`)
  } finally {
    recovering = false
  }
}

export function initResumeRecovery(): void {
  powerMonitor.on('resume', () => {
    void recoverAfterResume()
  })
}
