// Noctur: process icons on the Connections page are cached in localStorage, keyed by the process
// path, with no expiry (store/icons-store.ts). The data folder, and with it this storage, moved over
// from Astra Clash, so the core's own entry ("mihomo", drawn with the app's icon) kept showing Astra
// Clash's icon. When the app version differs from the one that filled the cache, the cached icons
// are dropped and fetched again; other stored values stay.

const VERSION_KEY = 'noctur.iconCacheVersion'

type Storage = Pick<globalThis.Storage, 'length' | 'key' | 'getItem' | 'removeItem' | 'setItem'>

export function dropIconCacheOnUpdate(storage: Storage, version: string): void {
  if (!version || storage.getItem(VERSION_KEY) === version) return
  const icons: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && key !== VERSION_KEY && storage.getItem(key)?.startsWith('data:image/')) icons.push(key)
  }
  icons.forEach((key) => storage.removeItem(key))
  storage.setItem(VERSION_KEY, version)
}
