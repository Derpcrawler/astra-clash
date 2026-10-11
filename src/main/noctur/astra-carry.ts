// Noctur: settings carried over from Astra Clash (the app's previous name).
// Autostart: on Linux the data folder move removes Astra Clash's autostart entry and reports it
// (noctur/migrate-early.ts); on Windows the installer removes Astra Clash's task and leaves the
// marker below next to the exe (build/nsis/installer.nsh). Noctur then turns its own autostart on,
// and the marker is deleted.
import { existsSync, rmSync } from 'fs'
import path from 'path'
import { Notification } from 'electron'
import { enableAutoRun } from '../sys/autoRun'
import { exeDir } from '../utils/dirs'
import { t } from '../utils/i18n'
import { astraLinuxAutostart, astraMigration } from './migrate-early'

export const WINDOWS_AUTOSTART_MARKER = 'astra-clash-autostart'

export async function carryAstraAutostart(): Promise<void> {
  const marker = path.join(exeDir(), WINDOWS_AUTOSTART_MARKER)
  const fromWindows = process.platform === 'win32' && existsSync(marker)
  if (!astraLinuxAutostart && !fromWindows) return
  try {
    await enableAutoRun()
  } catch {
    return
  }
  if (fromWindows) {
    try {
      rmSync(marker, { force: true })
    } catch {
      // the install folder needs administrator rights; the task exists now, so a retry is harmless
    }
  }
}

/**
 * When Astra Clash's data could not be moved (noctur/migrate-astra.ts), this start uses the old
 * folder; says so once, with the reason in the log.
 */
export function reportAstraMove(): void {
  if (!astraMigration?.useOldDir) return
  console.error(`Moving Astra Clash's data folder is unfinished: ${astraMigration.error ?? ''}`)
  try {
    new Notification({ title: t('notification.astraMoveTitle'), body: t('notification.astraMoveBody') }).show()
  } catch {
    // no notification support: the log has it
  }
}
