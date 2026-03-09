import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/ui/**/*.test.tsx'],
    testTimeout: 15000,
    alias: {
      '@': resolve(__dirname, 'src')
    },
    setupFiles: ['tests/ui/setup.ts']
  }
})
