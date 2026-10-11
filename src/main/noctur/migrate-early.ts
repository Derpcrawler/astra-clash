// Noctur: moves Astra Clash's data folder before anything else reads the data folder. Imported
// first in index.ts. Packaged builds only, so a development run never moves a real installation's
// data; portable Windows copies keep their data next to the exe and are left alone.
import { app } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { MoveResult, moveOldDataDir, OLD_DATA_DIR_NAME, takeOldLinuxAutostart } from './migrate-astra'

export let astraMigration: MoveResult | null = null
/** Astra Clash had autostart on Linux; index.ts turns on Noctur's after startup. */
export let astraLinuxAutostart = false

const portable = existsSync(path.join(path.dirname(app.getPath('exe')), 'PORTABLE'))
if (app.isPackaged && !portable) {
  const oldDir = path.join(app.getPath('appData'), OLD_DATA_DIR_NAME)
  try {
    astraMigration = moveOldDataDir(oldDir, app.getPath('userData'))
    if (astraMigration?.useOldDir) {
      // Unfinished: this start works on the old folder, so nothing is written next to half-moved
      // data; the next start tries again (noctur/migrate-astra.ts).
      app.setPath('userData', oldDir)
    } else if (astraMigration && process.platform === 'linux') {
      astraLinuxAutostart = takeOldLinuxAutostart(app.getPath('home'))
    }
  } catch {
    // startup continues with whatever data folder there is
  }
}
