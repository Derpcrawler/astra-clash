import { getVersion } from './ipc'
import { dropIconCacheOnUpdate } from '@renderer/noctur/icon-cache'
// const originError = console.error
// const originWarn = console.warn
// console.error = function (...args: any[]): void {
//   if (typeof args[0] === 'string' && args[0].includes('validateDOMNesting')) {
//     return
//   }
//   originError.call(console, args)
// }
// console.warn = function (...args): void {
//   if (typeof args[0] === 'string' && args[0].includes('aria-label')) {
//     return
//   }
//   originWarn.call(console, args)
// }

export const platform: NodeJS.Platform = window.api.platform
export let version: string = ''

export async function init(): Promise<void> {
  version = await getVersion()
  try {
    dropIconCacheOnUpdate(localStorage, version)
  } catch {
    // storage unavailable: icons are fetched as before
  }
}
