import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Tests for main-process code. Electron is replaced by a small stub (test/mocks/electron.ts);
// tests override parts of it with vi.mock where they need specific behavior.
export default defineConfig({
  resolve: {
    alias: {
      electron: resolve(__dirname, 'test/mocks/electron.ts')
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Dependencies that import electron themselves are bundled so the stub replaces it there too.
    server: { deps: { inline: ['@electron-toolkit/utils'] } },
    testTimeout: 15000
  }
})
