// Noctur: renderer side of main/noctur/core-download.ts.

export interface CoreRelease {
  version: string
  asset: string
  url: string
  sha256: string
  size: number
}
export interface CoreState {
  active: string | null
  installed: string[]
  builtIn: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(res: any): any {
  if (res && typeof res === 'object' && 'invokeError' in res) throw res.invokeError
  return res
}
const invoke = async (ch: string, ...args: unknown[]): Promise<unknown> =>
  unwrap(await window.electron.ipcRenderer.invoke(ch, ...args))

export const latestCore = (): Promise<CoreRelease> => invoke('nocturLatestCore') as Promise<CoreRelease>
export const coreState = (): Promise<CoreState> => invoke('nocturCoreState') as Promise<CoreState>
export const downloadCore = (): Promise<string> => invoke('nocturDownloadCore') as Promise<string>
export const useDownloadedCore = (version: string | null): Promise<void> =>
  invoke('nocturUseDownloadedCore', version) as Promise<void>
export const removeCore = (version: string): Promise<void> => invoke('nocturRemoveCore', version) as Promise<void>
