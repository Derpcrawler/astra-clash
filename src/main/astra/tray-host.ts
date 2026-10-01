// Astra Clash: on Linux the tray icon is a StatusNotifierItem, shown only when a desktop runs a
// StatusNotifierWatcher (KDE, Cinnamon, GNOME with the AppIndicator extension). Stock GNOME has
// none, so a hidden window would leave no icon, no Quit and a running core. The window's close
// button quits instead when this returns false.
import { execFile } from 'child_process'

export function hasTrayHost(): Promise<boolean> {
  if (process.platform !== 'linux') return Promise.resolve(true)
  return new Promise((resolve) => {
    execFile(
      'dbus-send',
      [
        '--session',
        '--print-reply',
        '--dest=org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus.NameHasOwner',
        'string:org.kde.StatusNotifierWatcher'
      ],
      { timeout: 2000 },
      (error, stdout) => resolve(!error && /boolean true/.test(stdout))
    )
  })
}
