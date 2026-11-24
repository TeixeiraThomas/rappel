import { expect, test } from '@playwright/test'
import { ageNotes } from './age'
import { createDeckUI, makeApkg, openApp, readTable, seed } from './helpers'

const DECK = [{ name: 'Réseau', cards: [{ front: 'VLAN ?', back: 'Réseau local virtuel' }, { front: 'OSPF ?', back: 'Protocole à état de liens' }] }]

test.describe('Sécurité des données', () => {
  test('le stockage persistant est demandé dès le lancement et son état est affiché', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __persistCalls: number }
      w.__persistCalls = 0
      const s = navigator.storage
      s.persist = async () => {
        w.__persistCalls++
        return true
      }
      s.persisted = async () => w.__persistCalls > 0
    })
    await openApp(page)
    await expect.poll(() => page.evaluate(() => (window as unknown as { __persistCalls: number }).__persistCalls)).toBeGreaterThanOrEqual(1)
    await page.goto('/#/settings')
    await expect(page.getByText('Stockage protégé :')).toBeVisible()
    await expect(page.getByText('oui ✓')).toBeVisible()
  })

  test('rappel de sauvegarde : absent au début, présent après 8 jours, report puis export', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    await expect(page.getByRole('region', { name: 'Rappel de sauvegarde' })).toHaveCount(0)

    await ageNotes(page, 8)
    await page.reload()
    const banner = page.getByRole('region', { name: 'Rappel de sauvegarde' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Aucune sauvegarde exportée')

    // « Plus tard » : le bandeau disparaît et reste masqué après rechargement
    await banner.getByRole('button', { name: 'Plus tard' }).click()
    await expect(banner).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
    await expect(banner).toHaveCount(0)

    // Un export réel enregistre la date de sauvegarde
    await page.goto('/#/settings')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter', exact: true }).click()])
    expect(dl.suggestedFilename()).toContain('rappel-sauvegarde')
    const kv = await readTable<{ key: string; value: number }>(page, 'kv')
    expect(kv.find((r) => r.key === 'lastBackup')?.value).toBeGreaterThan(Date.now() - 60_000)
  })

  test('le rappel peut être désactivé dans les Réglages', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    await ageNotes(page, 30)
    await page.goto('/#/settings')
    await page.getByLabel('Rappel de sauvegarde').selectOption('0')
    await page.goto('/#/')
    await expect(page.getByRole('button', { name: 'Étudier Réseau' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Rappel de sauvegarde' })).toHaveCount(0)
  })

  test('suppression d’un paquet : confirmation obligatoire, annulation sans effet', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    await page.getByRole('button', { name: 'Options de Réseau' }).click()
    await page.getByRole('button', { name: 'Supprimer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Supprimer ce paquet ?' })
    await expect(dialog).toContainText('définitivement supprimés')
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    expect(await readTable(page, 'decks')).toHaveLength(1)
    expect(await readTable(page, 'notes')).toHaveLength(2)

    await page.getByRole('button', { name: 'Options de Réseau' }).click()
    await page.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect.poll(async () => (await readTable(page, 'decks')).length).toBe(0)
    expect(await readTable(page, 'cards')).toHaveLength(0)
  })

  test('sauvegarde automatique avant import CSV et import Anki', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    await page.goto('/#/settings')
    await page.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('Q;R\n') })
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.getByText('1 carte importée')).toBeVisible()
    await expect(page.getByText('Avant import CSV')).toBeVisible()

    await page.locator('input[type=file][accept=".apkg"]').setInputFiles({ name: 'a.apkg', mimeType: 'application/octet-stream', buffer: await makeApkg() })
    await expect(page.getByText(/2 notes \(2 cartes\)/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Avant import Anki (.apkg)')).toBeVisible()
    // L'instantané « avant import CSV » contient bien l'état d'avant (2 notes)
    await expect(page.getByText(/2 notes · 2 cartes/).first()).toBeVisible()
  })

  test('supprimer une sauvegarde automatique demande confirmation', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    await page.goto('/#/settings')
    await page.locator('input[type=file][accept*=csv]').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('Q;R\n') })
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.getByText('Avant import CSV')).toBeVisible()
    await page.getByRole('button', { name: /^Supprimer la sauvegarde du/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByText('Avant import CSV')).toBeVisible()
    await page.getByRole('button', { name: /^Supprimer la sauvegarde du/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.getByText('Avant import CSV')).toHaveCount(0)
  })
})

test.describe('Finitions', () => {
  test('écrans vides : accueil, parcourir, statistiques', async ({ page }) => {
    await openApp(page)
    await expect(page.getByText('Bienvenue dans Rappel')).toBeVisible()
    await page.goto('/#/browse')
    await expect(page.getByText('Aucune carte', { exact: true })).toBeVisible()
    await page.goto('/#/stats')
    await expect(page.getByText('Pas encore de statistiques')).toBeVisible()
  })

  test('message « rien à étudier » après avoir tout révisé', async ({ page }) => {
    await openApp(page)
    await seed(page, [{ name: 'Mini', cards: [{ front: 'a', back: 'b' }] }])
    await page.getByRole('button', { name: 'Étudier Mini' }).click()
    await expect(page.locator('.study-card')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(page.locator('.rate')).toHaveCount(4)
    await page.keyboard.press('4')
    await expect(page.getByRole('heading', { name: /Séance terminée/ })).toBeVisible()
    await page.getByRole('button', { name: 'Retour aux paquets' }).click()
    await expect(page.getByText('Rien à étudier pour le moment')).toBeVisible()
  })

  test('adresse inconnue : page introuvable avec lien de retour', async ({ page }) => {
    await openApp(page, '/#/nimportequoi')
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible()
    await page.getByRole('link', { name: 'Retour aux paquets' }).click()
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
  })

  test('stockage local bloqué : écran d’erreur clair', async ({ page }) => {
    await page.addInitScript(() => {
      indexedDB.open = () => {
        throw new DOMException('Accès refusé', 'SecurityError')
      }
    })
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText('Stockage local indisponible')
    await expect(page.getByRole('button', { name: 'Recharger' })).toBeVisible()
  })

  test('éditeur : confirmation avant de quitter avec du texte non enregistré', async ({ page }) => {
    await openApp(page)
    await createDeckUI(page, 'D')
    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByRole('button', { name: 'Retour' }).click() // rien saisi : retour direct
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()

    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('texte important')
    await page.getByRole('button', { name: 'Retour' }).click()
    const dialog = page.getByRole('dialog', { name: 'Quitter sans enregistrer ?' })
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByLabel('Recto', { exact: true })).toHaveValue('texte important')
    await page.getByRole('button', { name: 'Retour' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Quitter' }).click()
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
  })

  test('le titre de la page suit l’écran affiché', async ({ page }) => {
    await openApp(page)
    await expect(page).toHaveTitle('Rappel')
    await page.goto('/#/settings')
    await expect(page).toHaveTitle('Réglages — Rappel')
    await page.goto('/#/stats')
    await expect(page).toHaveTitle('Statistiques — Rappel')
  })

  test('la navigation indique l’écran courant (aria-current)', async ({ page }) => {
    await openApp(page, '/#/stats')
    await expect(page.getByRole('link', { name: 'Stats' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: 'Paquets' })).not.toHaveAttribute('aria-current', 'page')
  })
})
