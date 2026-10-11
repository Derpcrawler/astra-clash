import { describe, expect, it } from 'vitest'
import { pickLanguage } from '../src/main/utils/i18n'

// Failure guarded: the main process started in Russian and switched only when the window had loaded,
// so an English user saw the menu bar menu in Russian at launch (owner, 2026-10-11).
describe('main process language at startup', () => {
  it('uses the saved language, else the system language, not Russian', () => {
    expect(pickLanguage('en-US', ['ru-RU'])).toBe('en-US')
    expect(pickLanguage(undefined, ['en-US', 'ru-US'])).toBe('en-US')
  })
})
