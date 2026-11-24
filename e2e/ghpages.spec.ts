import { expect, test } from '@playwright/test'

// Build « GitHub Pages » : l'application est servie sous /rappel/ (base du dépôt), comme en ligne.
// Vérifie que TOUS les chemins respectent la base : assets, manifeste, icônes, service worker,
// et que l'app fonctionne hors ligne dans ce sous-dossier.

const BASE = '/rappel/'

test.describe('Build GitHub Pages (base /rappel/)', () => {
  test('toutes les ressources sont chargées sous la base, sans erreur 404', async ({ page }) => {
    const bad: string[] = []
    const outside: string[] = []
    const errors: string[] = []
    page.on('response', (r) => {
      const u = new URL(r.url())
      if (u.origin !== new URL(page.url() || 'http://localhost:4174').origin && !r.url().startsWith('http://localhost:4174')) return
      if (r.status() >= 400) bad.push(`${r.status()} ${u.pathname}`)
      if (!u.pathname.startsWith(BASE)) outside.push(u.pathname)
    })
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

    await page.goto(BASE)
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
    // Écrans chargés à la demande (chunks JS) : tous sous la base
    for (const route of ['#/browse', '#/stats', '#/settings', '#/new']) {
      await page.goto(BASE + route)
      await page.waitForLoadState('networkidle')
    }
    expect(bad, 'ressources en erreur').toEqual([])
    expect(outside, 'ressources hors de /rappel/').toEqual([])
    expect(errors).toEqual([])
  })

  test('manifeste : start_url, scope et icônes pointent sous /rappel/', async ({ page, request }) => {
    await page.goto(BASE)
    const href = (await page.locator('link[rel=manifest]').getAttribute('href'))!
    expect(href.startsWith(BASE)).toBe(true)
    const manifest = await (await request.get(new URL(href, page.url()).toString())).json()
    expect(manifest.start_url).toBe(BASE)
    expect(manifest.scope).toBe(BASE)
    for (const icon of manifest.icons) {
      const url = new URL(icon.src, new URL(href, page.url()))
      expect(url.pathname.startsWith(BASE), icon.src).toBe(true)
      expect((await request.get(url.toString())).status(), icon.src).toBe(200)
    }
    for (const rel of ['icon', 'apple-touch-icon']) {
      const h = (await page.locator(`link[rel=${rel}]`).first().getAttribute('href'))!
      expect(h.startsWith(BASE), `${rel} → ${h}`).toBe(true)
      expect((await request.get(new URL(h, page.url()).toString())).status()).toBe(200)
    }
  })

  test('le service worker est enregistré avec la portée /rappel/ et fonctionne hors ligne', async ({ page, context }) => {
    await page.goto(BASE)
    await page.evaluate(() => navigator.serviceWorker.ready)
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope)
    expect(new URL(scope!).pathname).toBe(BASE)
    await expect.poll(async () => {
      const c = await page.evaluate(() => !!navigator.serviceWorker.controller)
      if (!c) await page.reload()
      return c
    }, { timeout: 20_000 }).toBe(true)

    await context.setOffline(true)
    await page.goto(BASE + '#/settings')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible()
    // Image de marque (relative) et navigation interne OK hors ligne
    await page.getByRole('link', { name: 'Paquets' }).click()
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
    await context.setOffline(false)
  })

  test('import .apkg : le WASM se charge sous la base', async ({ page }) => {
    const { makeApkg } = await import('./helpers')
    await page.goto(BASE + '#/settings')
    await page.locator('input[type=file][accept=".apkg"]').setInputFiles({ name: 'a.apkg', mimeType: 'application/octet-stream', buffer: await makeApkg() })
    await expect(page.getByText(/2 notes \(2 cartes\)/)).toBeVisible({ timeout: 20_000 })
  })
})
