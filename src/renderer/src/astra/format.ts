// Astra Clash: byte amounts in a fixed number of characters, so a monospace readout keeps its width
// as values change (for example "0.00 B/s" to "11.4 MB/s"). Pair with white-space: pre.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function fixedBytes(bytes: number, perSecond = false): string {
  let v = Math.max(0, bytes || 0)
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  // Always 4 characters: 0.00 to 9.99, 10.0 to 99.9, then 100 to 1023.
  const num = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)
  const unit = perSecond ? `${UNITS[i]}/s` : UNITS[i]
  return `${num.padStart(4, ' ')} ${unit.padStart(perSecond ? 4 : 2, ' ')}`
}
