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
    await auto.getByText('Programme, chapitres et examen').click()
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

  test('nouvelles catégories, niveau et recherche', async ({ page }) => {
    await openApp(page, '/#/library')
    await page.getByRole('button', { name: /^Gestion et méthodes/ }).click()
    await expect(page.getByRole('article')).toHaveCount(2)
    await page.getByRole('button', { name: /^Tous les domaines/ }).click()
    await page.getByRole('button', { name: 'Intermédiaire' }).click()
    await expect(page.getByRole('article', { name: 'Microsoft Azure Administrator' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Microsoft Azure Fundamentals' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Tous niveaux' }).click()
    await page.getByRole('searchbox', { name: 'Rechercher un module' }).fill('az-104')
    await expect(page.getByRole('article')).toHaveCount(1)
    await page.getByRole('searchbox', { name: 'Rechercher un module' }).fill('introuvable')
    await expect(page.getByText('Aucun module ne correspond')).toBeVisible()
    await page.getByRole('button', { name: 'Effacer les filtres' }).click()
    await expect(page.getByRole('article')).toHaveCount(14)
  })

  test('domaines puis sous-catégories : Informatique › Cloud', async ({ page }) => {
    await openApp(page, '/#/library')
    // Les sous-catégories n'apparaissent qu'une fois un domaine choisi.
    await expect(page.getByRole('group', { name: 'Filtrer par catégorie' })).toHaveCount(0)
    await page.getByRole('button', { name: /^Informatique/ }).click()
    await expect(page.getByRole('article')).toHaveCount(8)
    await expect(page.getByRole('heading', { name: /^Réseau/, level: 3 })).toBeVisible()
    await page.getByRole('group', { name: 'Filtrer par catégorie' }).getByRole('button', { name: /^Cloud/ }).click()
    await expect(page.getByRole('article')).toHaveCount(5)
    await expect(page.getByRole('heading', { name: /^Réseau/, level: 3 })).toHaveCount(0)
    // Changer de domaine remet la sous-catégorie à zéro.
    await page.getByRole('button', { name: /^Permis de conduire/ }).click()
    await expect(page.getByRole('article')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: /^Voiture \(permis B\)/, level: 3 })).toBeVisible()
  })

  test('le plus demandé d’abord : permis en tête, badge et module TOEIC', async ({ page }) => {
    await openApp(page, '/#/library')
    await expect(page.locator('.lib-cat > h2').first()).toContainText('Permis de conduire')
    const auto = page.getByRole('article', { name: 'Code de la route — voiture' })
    await expect(auto.getByText('Le plus demandé')).toBeVisible()
    await page.getByRole('button', { name: /^Langues/ }).click()
    const toeic = page.getByRole('article', { name: 'TOEIC — anglais professionnel' })
    await toeic.getByRole('button', { name: 'Ajouter TOEIC — anglais professionnel' }).click()
    await expect(page.getByRole('status')).toContainText('« TOEIC » ajouté : 229 cartes')
  })

  test('ajouter un chapitre, suivre l’avancement, compléter puis retirer le module', async ({ page }) => {
    await openApp(page, '/#/library')
    const card = page.getByRole('article', { name: 'Scrum — Professional Scrum Master I' })
    await card.getByText('Programme, chapitres et examen').click()
    await card.getByRole('button', { name: 'Ajouter le chapitre « Théorie et valeurs »' }).click()
    await expect(page.getByRole('status')).toContainText('Chapitre « Théorie et valeurs » ajouté')
    await expect(card.getByText(/^Ajouté en partie \(1\/\d+ chapitres\)$/)).toBeVisible()
    await expect(card.getByRole('progressbar', { name: 'Avancement de Scrum — Professional Scrum Master I' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Étudier le chapitre « Théorie et valeurs »' })).toBeVisible()

    // « Mes modules » ne montre que les modules ajoutés.
    await page.getByRole('button', { name: 'Mes modules (1)' }).click()
    await expect(page.getByRole('article')).toHaveCount(1)

    await card.getByRole('button', { name: /^Compléter \(\+\d+\)$/ }).click()
    await expect(card.getByText('Ajouté', { exact: true })).toBeVisible()
    const all = (await readTable(page, 'notes')).length
    expect(all).toBe(91)

    await card.getByRole('button', { name: 'Retirer Scrum — Professional Scrum Master I' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click()
    await expect(page.getByRole('status')).toContainText('Module retiré : 91 notes supprimées')
    expect(await readTable(page, 'notes')).toHaveLength(0)
    expect(await readTable(page, 'decks')).toHaveLength(0)
    await expect(page.getByText("Vous n'avez encore ajouté aucun module.")).toBeVisible()
  })
})
