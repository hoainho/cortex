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
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['electron/**/*.ts'],
      exclude: [
        'electron/main.ts',
        'electron/preload.ts',
        'electron/**/*.d.ts',
        'node_modules/**',
        'out/**',
        'build/**'
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 40,
        statements: 50
      }
    }
  }
})
