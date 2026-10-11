import { create } from 'zustand'

// Noctur: the state of an update in progress, sent by the main process as 'update-status'
// (resolve/autoUpdater.ts) and shown by the update line on Home (noctur/update-line.tsx).
export type UpdaterStatus =
  | { phase: 'idle' }
  | { phase: 'downloading'; progress: number }
  | { phase: 'confirm' }
  | { phase: 'installing' }
  | { phase: 'restarting' }
  | { phase: 'error'; error: 'download' | 'checksum' | 'cancelled' | 'install' }

interface UpdaterStore {
  status: UpdaterStatus
  setStatus: (status: UpdaterStatus) => void
}

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  status: { phase: 'idle' },
  setStatus: (status): void => set({ status })
}))

let attached = false
let ipcListener: ((event: unknown, payload: UpdaterStatus) => void) | null = null

export const attachUpdaterStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true
  ipcListener = (_event, payload): void => {
    useUpdaterStore.setState({ status: payload })
  }
  window.electron.ipcRenderer.on('update-status', ipcListener)
  return (): void => {
    if (!attached) return
    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('update-status', ipcListener)
      ipcListener = null
    }
  }
}
