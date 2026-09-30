// Minimal stand-in for the electron module in unit tests. Only what the tested modules touch at
// import time or in the tested paths.
import { tmpdir } from 'os'

export const app = {
  getPath: (): string => tmpdir(),
  getName: (): string => 'Astra Clash',
  getVersion: (): string => '0.0.0-test',
  isPackaged: false,
  on: (): void => {},
  quit: (): void => {},
  exit: (): void => {}
}
export const net = { isOnline: (): boolean => true }
export const powerMonitor = { on: (): void => {} }
export const ipcMain = { on: (): void => {}, handle: (): void => {}, emit: (): void => {}, removeAllListeners: (): void => {} }
export const nativeTheme = { shouldUseDarkColors: true, themeSource: 'system' }
export const shell = { openExternal: async (): Promise<void> => {}, openPath: async (): Promise<string> => '' }
export const safeStorage = { isEncryptionAvailable: (): boolean => false }
export const Notification = class {
  show(): void {
    // nothing to show in tests
  }
}
export const BrowserWindow = class {}
export const dialog = {}
export const Menu = {}
export const Tray = class {}
export default { app, net, powerMonitor, ipcMain, nativeTheme, shell, safeStorage, Notification, BrowserWindow, dialog, Menu, Tray }
