import { create } from 'zustand'

export interface ConnectionsInfo {
  uploadTotal: number
  downloadTotal: number
  memory: number
}

interface ConnectionsStore {
  active: ControllerConnectionDetail[]
  closed: ControllerConnectionDetail[]
  info: ConnectionsInfo
  isPaused: boolean
  togglePause: () => void
  removeClosedById: (id: string) => void
  clearAllClosed: () => void
}

const MAX_CLOSED = 300

const initialInfo: ConnectionsInfo = {
  uploadTotal: 0,
  downloadTotal: 0,
  memory: 0
}

let previousActiveMap = new Map<string, ControllerConnectionDetail>()
// When previousActiveMap was taken. Speeds divide by the real time between two updates, since the
// core sends one every connectionInterval ms (500 by default), not one per second.
let previousAt = 0

export const useConnectionsStore = create<ConnectionsStore>((set) => ({
  active: [],
  closed: [],
  info: initialInfo,
  isPaused: false,
  togglePause: (): void => set((s) => ({ isPaused: !s.isPaused })),
  removeClosedById: (id): void =>
    set((s) => ({ closed: s.closed.filter((conn) => conn.id !== id) })),
  clearAllClosed: (): void => set({ closed: [] })
}))

const handleIpcPayload = (payload: ControllerConnections): void => {
  const { uploadTotal, downloadTotal, memory } = payload
  const state = useConnectionsStore.getState()
  const prevInfo = state.info

  const infoChanged =
    prevInfo.uploadTotal !== uploadTotal ||
    prevInfo.downloadTotal !== downloadTotal ||
    prevInfo.memory !== memory

  if (infoChanged) {
    useConnectionsStore.setState({ info: { uploadTotal, downloadTotal, memory } })
  }

  if (state.isPaused) return
  const incoming = payload.connections
  if (!incoming) return

  const currentMap = new Map<string, ControllerConnectionDetail>()
  const now = Date.now()
  const perSecond = previousAt ? 1000 / Math.max(now - previousAt, 1) : 0

  for (const conn of incoming) {
    if (conn.metadata.type === 'Inner') {
      conn.metadata.process = 'mihomo'
      conn.metadata.processPath = 'mihomo'
    }

    const pre = previousActiveMap.get(conn.id)
    conn.downloadSpeed = pre ? Math.max(0, Math.round((conn.download - pre.download) * perSecond)) : 0
    conn.uploadSpeed = pre ? Math.max(0, Math.round((conn.upload - pre.upload) * perSecond)) : 0
    conn.isActive = true

    previousActiveMap.delete(conn.id)
    currentMap.set(conn.id, conn)
  }

  let nextClosed = state.closed
  if (previousActiveMap.size > 0) {
    const newlyClosed: ControllerConnectionDetail[] = []
    for (const conn of previousActiveMap.values()) {
      conn.isActive = false
      conn.downloadSpeed = 0
      conn.uploadSpeed = 0
      newlyClosed.push(conn)
    }
    const merged = state.closed.concat(newlyClosed)
    nextClosed = merged.length > MAX_CLOSED ? merged.slice(merged.length - MAX_CLOSED) : merged
  }

  previousActiveMap = currentMap
  previousAt = now

  useConnectionsStore.setState({
    active: incoming,
    closed: nextClosed
  })
}

let attached = false
let ipcListener: ((event: unknown, payload: ControllerConnections) => void) | null = null

export const attachConnectionsStore = (): (() => void) => {
  if (attached) {
    return () => {
      /* already attached, noop detach */
    }
  }
  attached = true

  ipcListener = (_event, payload): void => {
    handleIpcPayload(payload)
  }
  window.electron.ipcRenderer.on('mihomoConnections', ipcListener)

  return (): void => {
    if (!attached) return
    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('mihomoConnections', ipcListener)
      ipcListener = null
    }
    previousActiveMap = new Map()
    previousAt = 0
    useConnectionsStore.setState({
      active: [],
      closed: [],
      info: initialInfo,
      isPaused: false
    })
  }
}
