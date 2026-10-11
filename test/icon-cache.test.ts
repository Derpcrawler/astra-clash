import { describe, expect, it } from 'vitest'
import { dropIconCacheOnUpdate } from '../src/renderer/src/noctur/icon-cache'

// Failure guarded: after the update from Astra Clash, whose data folder (with localStorage) moves
// into Noctur's, the Connections page kept showing Astra Clash's icon for the core's own "mihomo"
// entry, because cached icons never expire.

class MemoryStorage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
}

describe('icon cache after an update', () => {
  it('drops icons cached by an older version, keeping other stored values', () => {
    const storage = new MemoryStorage()
    storage.setItem('mihomo', 'data:image/png;base64,ASTRA')
    storage.setItem('/Applications/Safari.app/Contents/MacOS/Safari', 'data:image/png;base64,SAFARI')
    storage.setItem('connectionTableColumns', '["host","rule"]')

    dropIconCacheOnUpdate(storage, '1.1.0')

    expect(storage.getItem('mihomo')).toBeNull()
    expect(storage.getItem('/Applications/Safari.app/Contents/MacOS/Safari')).toBeNull()
    expect(storage.getItem('connectionTableColumns')).toBe('["host","rule"]')
  })
})
