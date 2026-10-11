// Noctur: connecting, disconnecting and changing the connection method (TUN or System Proxy) from
// any place (Home, the menu bar menu, Settings, keyboard shortcuts) go through one queue here, so
// two requests never interleave their steps. A Disconnect also stops a method change that is
// already running from turning the new method on: the user's last request wins.
import {
  getAppConfig,
  getControledMihomoConfig,
  patchAppConfig,
  patchControledMihomoConfig
} from '../config'
import { mihomoHotReloadConfig } from '../core/mihomoApi'
import { triggerSysProxy } from '../sys/sysproxy'
import { t } from '../utils/i18n'
import { mainWindow } from '..'
import { floatingWindow } from '../resolve/floatingWindow'

export type ConnectionMethod = 'tun' | 'sysproxy'

let queue: Promise<unknown> = Promise.resolve()

/** Runs connection work after everything queued before it, one at a time. */
export function runConnectionTask<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => {})
  return run
}

// Counts Disconnect requests at the moment they are made, before they reach the queue.
let disconnects = 0

function notifyWindows(channel: 'appConfigUpdated' | 'controledMihomoConfigUpdated'): void {
  mainWindow?.webContents.send(channel)
  floatingWindow?.webContents.send(channel)
}

/**
 * Why a method cannot carry traffic now, or null. System Proxy set to write a manual proxy needs
 * the mixed port; with port 0 nothing would listen (the same rule as Home's Connect button).
 */
export async function methodUnavailable(method: ConnectionMethod): Promise<string | null> {
  if (method !== 'sysproxy') return null
  const { sysProxy } = await getAppConfig()
  const { 'mixed-port': mixedPort } = await getControledMihomoConfig()
  const writes = sysProxy?.enable ?? true
  if (writes && sysProxy?.mode === 'manual' && mixedPort == 0) return t('tray.proxyNeedsPort')
  return null
}

async function isConnected(): Promise<{ method: ConnectionMethod; connected: boolean }> {
  const { mainSwitchMode = 'tun', proxyMode = false } = await getAppConfig()
  const { tun } = await getControledMihomoConfig()
  return { method: mainSwitchMode, connected: mainSwitchMode === 'tun' ? (tun?.enable ?? false) : proxyMode }
}

// Turns one connection method on or off. TUN routes all traffic through mihomo; System Proxy sets
// the system proxy when the system proxy setting is on. Not queued: callers here hold the queue.
async function setMethod(method: ConnectionMethod, enable: boolean): Promise<void> {
  const { sysProxy, onlyActiveDevice = false } = await getAppConfig()
  const writes = sysProxy?.enable ?? true
  if (method === 'tun') {
    if (enable) {
      await patchControledMihomoConfig({ tun: { enable }, dns: { enable: true } })
    } else {
      await patchControledMihomoConfig({ tun: { enable } })
    }
    notifyWindows('controledMihomoConfigUpdated')
  } else {
    if (enable) {
      await patchAppConfig({ proxyMode: true })
      await mihomoHotReloadConfig()
      if (writes) await triggerSysProxy(true, onlyActiveDevice)
    } else {
      if (writes) await triggerSysProxy(false, onlyActiveDevice)
      await patchAppConfig({ proxyMode: false })
      await mihomoHotReloadConfig()
    }
    notifyWindows('appConfigUpdated')
  }
}

/** Turns one method on or off by itself (Settings switches, keyboard shortcuts). */
export function setMethodEnabled(method: ConnectionMethod, enable: boolean): Promise<void> {
  if (!enable) disconnects++
  return runConnectionTask(async () => {
    if (enable) {
      const why = await methodUnavailable(method)
      if (why) throw new Error(why)
    }
    await setMethod(method, enable)
  })
}

/**
 * Home's Connect and Disconnect, and the menu bar's: connects through the chosen method, or turns
 * off whatever is on.
 */
export function setConnected(enable: boolean): Promise<void> {
  if (!enable) disconnects++
  return runConnectionTask(async () => {
    if (enable) {
      const { method } = await isConnected()
      const why = await methodUnavailable(method)
      if (why) throw new Error(why)
      await setMethod(method, true)
      if (method === 'tun') await mihomoHotReloadConfig()
      return
    }
    const { proxyMode = false } = await getAppConfig()
    const { tun } = await getControledMihomoConfig()
    if (tun?.enable) await setMethod('tun', false)
    // Turning System Proxy off reloads the core; with TUN alone, reload here.
    if (proxyMode) await setMethod('sysproxy', false)
    else if (tun?.enable) await mihomoHotReloadConfig()
  })
}

/**
 * Saves which method Connect uses. When connected, swaps the running method so the user stays
 * connected; if the new one fails, the old one comes back. A method that cannot work now is refused
 * before the running one is turned off. A Disconnect made meanwhile leaves both off.
 */
export function changeConnectionMethod(to: ConnectionMethod): Promise<void> {
  if (to !== 'tun' && to !== 'sysproxy') {
    return Promise.reject(new Error(`unknown connection method: ${to}`))
  }
  const seen = disconnects
  return runConnectionTask(async () => {
    const { method: from, connected } = await isConnected()
    if (from === to) return
    if (connected && disconnects === seen) {
      const why = await methodUnavailable(to)
      if (why) throw new Error(why)
      await setMethod(from, false)
      if (disconnects === seen) {
        try {
          await setMethod(to, true)
        } catch (e) {
          if (disconnects === seen) await setMethod(from, true)
          throw e
        }
      }
    }
    await patchAppConfig({ mainSwitchMode: to })
    notifyWindows('appConfigUpdated')
  })
}
