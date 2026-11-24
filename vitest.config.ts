import { realpathSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Configuration de test séparée (sans plugin PWA/React) : on ne teste que la logique pure + Dexie.
// Sous Windows, un répertoire courant à la casse différente (c:\ au lieu de C:\) fait charger Vitest en double :
// on impose donc la casse réelle du chemin comme racine.
export default defineConfig({
  root: realpathSync.native(process.cwd()),
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
