import { defineConfig } from 'vitest/config'

// Configuration de test séparée (sans plugin PWA/React) : on ne teste que la logique pure + Dexie.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
