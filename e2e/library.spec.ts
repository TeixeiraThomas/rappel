import { expect, test } from '@playwright/test'
import { openApp, readTable } from './helpers'

// Bibliothèque de modules : ajout en un geste, état « Ajouté », réajout sans doublon, révision des cartes ajoutées.

test.describe('Modules prêts à l’emploi', () => {
  test('ajouter un module, le retrouver dans les paquets et l’étudier', async ({ page }) => {
    await openApp(page)
    // L'accueil vide propose les modules.
    await page.getByRole('link', { name: 'Choisir un module' }).click()
    await expect(page.getByRole('heading', { name: 'Modules', level: 1 })).toBeVisible()

    const card = page.getByRole('article', { name: 'Scrum — Professional Scrum Master I' })
    await card.getByRole('button', { name: /^Ajouter/ }).click()
    await expect(page.getByRole('status')).toContainText('« Scrum (PSM I) » ajouté')
    await expect(card.getByText('Ajouté', { exact: true })).toBeVisible()

    const notes = await readTable<{ tags: string[] }>(page, 'notes')
    expect(notes.length).toBeGreaterThan(50)
    expect(notes.every((n) => n.tags.includes('scrum-psm1'))).toBe(true)

    // Réajout : aucune carte en double.
    await card.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(page.getByRole('status')).toContainText('Module déjà à jour')
    expect((await readTable(page, 'notes')).length).toBe(notes.length)

    // Étudier : la séance démarre sur la première carte du programme.
    await card.getByRole('button', { name: 'Étudier' }).click()
    await expect(page.locator('.study-card')).toContainText('Scrum en une phrase ?')

    // Le paquet et ses chapitres apparaissent sur l'accueil.
    await page.goto('/#/')
    await expect(page.getByRole('button', { name: 'Étudier Scrum (PSM I)', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Étudier Scrum (PSM I)::1. Théorie et valeurs' })).toBeVisible()
  })

  test('filtre par catégorie et programme détaillé', async ({ page }) => {
    await openApp(page, '/#/library')
    await page.getByRole('button', { name: 'Permis de conduire' }).click()
    await expect(page.getByRole('article')).toHaveCount(2)
    const auto = page.getByRole('article', { name: 'Code de la route — voiture' })
    await auto.getByText('Programme et examen').click()
    await expect(auto.getByText('35 bonnes réponses sur 40')).toBeVisible()
    await expect(auto.getByRole('listitem').first()).toContainText('Panneaux de danger')
  })

  test('les panneaux dessinés s’affichent dans les cartes', async ({ page }) => {
    await openApp(page, '/#/library')
    const auto = page.getByRole('article', { name: 'Code de la route — voiture' })
    await auto.getByRole('button', { name: /^Ajouter/ }).click()
    await expect(auto.getByText('Ajouté', { exact: true })).toBeVisible()
    await page.goto(`/#/browse?q=${encodeURIComponent('tag:panneaux-danger')}`)
    await page.getByText('Virage à droite', { exact: true }).click()
    await page.getByRole('button', { name: 'Aperçu' }).click()
    await expect(page.locator('.preview svg.sign').first()).toBeVisible()
  })
})
