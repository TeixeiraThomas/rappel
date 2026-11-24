import { expect, test } from '@playwright/test'
import { createDeckUI, openApp, readTable } from './helpers'

// Vraie coupure réseau : context.setOffline(true) coupe TOUT le réseau du navigateur.
// L'application doit démarrer, naviguer (y compris vers les écrans chargés à la demande),
// créer et réviser des cartes uniquement avec le service worker et IndexedDB.

test.describe('Hors ligne', () => {
  test('démarrage, navigation, création et révision sans réseau', async ({ page, context }) => {
    await openApp(page)
    // Attendre que le service worker ait précaché l'application et contrôle la page.
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect
      .poll(async () => {
        const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
        if (!controlled) await page.reload()
        return controlled
      }, { timeout: 20_000 })
      .toBe(true)
    // Le précache est complet (au moins l'index, le JS principal et les écrans à la demande)
    const cached = await page.evaluate(async () => {
      const names = await caches.keys()
      const out: string[] = []
      for (const n of names) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname)
      return out
    })
    expect(cached.some((p) => p.endsWith('index.html'))).toBe(true)
    expect(cached.filter((p) => p.endsWith('.js')).length).toBeGreaterThanOrEqual(5)
    expect(cached.some((p) => p.endsWith('.wasm'))).toBe(true)

    // --- Coupure réseau ---
    await context.setOffline(true)
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
    const failed = await page.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => false, () => true))
    expect(failed).toBe(true) // le réseau est réellement coupé

    // Rechargement complet hors ligne, sur l'accueil puis sur un écran chargé à la demande
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
    await page.goto('/#/settings')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible()
    await page.goto('/#/stats')
    await expect(page.getByRole('heading', { name: 'Statistiques', level: 1 })).toBeVisible()

    // Création et révision hors ligne
    await page.goto('/#/')
    await createDeckUI(page, 'Hors ligne')
    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('Fonctionne sans réseau ?')
    await page.getByLabel('Verso', { exact: true }).fill('Oui')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await page.getByRole('button', { name: 'Étudier Hors ligne' }).click()
    await expect(page.locator('.study-card')).toContainText('Fonctionne sans réseau ?')
    await page.keyboard.press('Space')
    await expect(page.locator('.rate')).toHaveCount(4)
    await page.keyboard.press('4')
    await expect.poll(async () => (await readTable(page, 'reviews')).length).toBe(1)

    // Les données écrites hors ligne survivent à un rechargement hors ligne
    await page.goto('/#/browse')
    await page.reload()
    await expect(page.getByText('Fonctionne sans réseau ?')).toBeVisible()

    // Retour du réseau : tout fonctionne toujours
    await context.setOffline(false)
    await page.reload()
    await expect(page.getByText('Fonctionne sans réseau ?')).toBeVisible()
  })

  test('import .apkg hors ligne (WASM servi par le cache)', async ({ page, context }) => {
    await openApp(page)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect.poll(async () => {
      const c = await page.evaluate(() => !!navigator.serviceWorker.controller)
      if (!c) await page.reload()
      return c
    }, { timeout: 20_000 }).toBe(true)
    await context.setOffline(true)
    await page.goto('/#/settings')
    await page.reload()
    const { makeApkg } = await import('./helpers')
    await page.locator('input[type=file][accept=".apkg"]').setInputFiles({ name: 'a.apkg', mimeType: 'application/octet-stream', buffer: await makeApkg() })
    await expect(page.getByText(/2 notes \(2 cartes\)/)).toBeVisible({ timeout: 20_000 })
    await context.setOffline(false)
  })

  test('manifeste PWA valide et icônes disponibles', async ({ page, request }) => {
    await openApp(page)
    const href = await page.locator('link[rel=manifest]').getAttribute('href')
    const manifest = await (await request.get(href!)).json()
    expect(manifest).toMatchObject({ name: 'Rappel — cartes mémoire', short_name: 'Rappel', display: 'standalone', lang: 'fr' })
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, new URL(href!, page.url())).toString())
      expect(res.status(), icon.src).toBe(200)
    }
    const apple = await page.locator('link[rel=apple-touch-icon]').getAttribute('href')
    expect((await request.get(new URL(apple!, page.url()).toString())).status()).toBe(200)
  })
})
