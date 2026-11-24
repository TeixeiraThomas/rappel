import { defineConfig, devices } from '@playwright/test'

// Tests de bout en bout : on teste le BUILD de production (service worker, hors ligne), servi par
// `vite preview`. Trois profils : Chromium desktop, et émulation iPhone / Android (viewport, tactile,
// user-agent) sur Chromium — WebKit réel n'est pas disponible dans cet environnement.
const PORT = 4173
const PORT_GH = 4174

/** Profil d'appareil sans le moteur par défaut (iPhone = WebKit) : on garde Chromium. */
const onChromium = (name: keyof typeof devices) => {
  const { defaultBrowserType: _ignored, ...rest } = devices[name]
  void _ignored
  return { ...rest, browserName: 'chromium' as const }
}

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', locale: 'fr-FR', timezoneId: 'Europe/Paris' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testIgnore: /ghpages/ },
    { name: 'iphone', use: onChromium('iPhone 13'), testIgnore: /ghpages|perf/ },
    { name: 'android', use: onChromium('Pixel 7'), testIgnore: /ghpages|perf/ },
    // Build « GitHub Pages » (base /rappel/) servi sur un autre port.
    { name: 'ghpages', use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT_GH}` }, testMatch: /ghpages/ },
  ],
  webServer: [
    {
      command: `node scripts/run-tool.mjs vite build && node scripts/run-tool.mjs vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Build avec la base /rappel/ dans un dossier à part, comme sur GitHub Pages.
      command: `node scripts/serve-gh.mjs ${PORT_GH}`,
      url: `http://localhost:${PORT_GH}/rappel/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
