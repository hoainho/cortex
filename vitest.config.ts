import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'tests/ui/**'],
    testTimeout: 30000,
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
