import { expect, test } from '@playwright/test'
import { createDeckUI, openApp, saveCard } from './helpers'

test.describe('Création de cartes', () => {
  test('paquet → carte avec bloc de code → recherche → révision', async ({ page }) => {
    await openApp(page)
    await expect(page.getByText('Bienvenue dans Rappel')).toBeVisible()
    await createDeckUI(page, 'Réseau')

    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('Quelle commande affiche la table de routage ?')
    await page.getByLabel('Verso', { exact: true }).fill('```\nshow ip route\n```')
    await page.getByLabel(/Tags/).fill('Cisco routage')
    await page.getByRole('button', { name: 'Aperçu' }).click()
    await expect(page.locator('.preview pre code')).toHaveText('show ip route')
    await saveCard(page)

    // Recherche dans « Parcourir »
    await page.getByRole('link', { name: 'Parcourir' }).click()
    await expect(page.getByText('Quelle commande affiche la table de routage ?')).toBeVisible()
    await page.getByRole('searchbox').fill('tag:cisco')
    await expect(page.getByText('1 note trouvée')).toBeVisible()
    await page.getByRole('searchbox').fill('tag:linux')
    await expect(page.getByText('Aucun résultat')).toBeVisible()

    // Révision : le recto, puis le bloc de code avec son bouton « Copier »
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Étudier Réseau' }).click()
    await expect(page.getByText('Quelle commande affiche la table de routage ?')).toBeVisible()
    await page.getByRole('button', { name: /Afficher la réponse/ }).click()
    await expect(page.locator('.study-card pre code')).toHaveText('show ip route')
    await expect(page.locator('.study-card button[data-copy]')).toBeVisible()
  })

  test('texte à trous : une carte par numéro de trou', async ({ page }) => {
    await openApp(page)
    await createDeckUI(page, 'Cours')
    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByRole('tab', { name: 'Texte à trous' }).click()
    await page.getByLabel('Texte (avec trous)').fill('Le protocole {{c1::OSPF}} utilise le numéro {{c2::89}}.')
    await expect(page.getByText('2 cartes générées')).toBeVisible()
    await saveCard(page)

    await page.goto('/#/study/all')
    // Carte c1 : OSPF masqué, 89 visible
    await expect(page.locator('.study-card .cloze')).toBeVisible()
    await expect(page.locator('.study-card')).toContainText('89')
    await expect(page.locator('.study-card')).not.toContainText('OSPF')
    await page.keyboard.press('Space')
    await expect(page.locator('.study-card .cloze-reveal')).toHaveText('OSPF')
  })

  test('recto/verso + inverse : deux cartes, la seconde pose le verso', async ({ page }) => {
    await openApp(page)
    await createDeckUI(page, 'Langues')
    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByRole('tab', { name: '+ inverse' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('chat')
    await page.getByLabel('Verso', { exact: true }).fill('cat')
    await expect(page.getByText('2 cartes générées')).toBeVisible()
    await saveCard(page)
    await page.goto('/#/study/all')
    const seen = new Set<string>()
    for (let i = 0; i < 2; i++) {
      seen.add((await page.locator('.study-card .face').first().innerText()).trim())
      await page.keyboard.press('Space')
      await page.keyboard.press('4')
    }
    expect(seen).toEqual(new Set(['chat', 'cat']))
  })

  test('validation : message clair si le verso est vide', async ({ page }) => {
    await openApp(page)
    await createDeckUI(page, 'D')
    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('seulement un recto')
    await expect(page.getByText('Le verso est vide.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled()
  })

  test('modifier puis supprimer une carte (avec confirmation)', async ({ page }) => {
    await openApp(page)
    await createDeckUI(page, 'D')
    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('avant')
    await page.getByLabel('Verso', { exact: true }).fill('x')
    await saveCard(page)

    await page.goto('/#/browse')
    await page.locator('.note-item').filter({ hasText: 'avant' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('après')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page).toHaveURL(/#\/browse$/)
    await expect(page.locator('.note-item .title')).toHaveText('après')

    await page.locator('.note-item').click()
    await page.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click() // annulation : rien n'est supprimé
    await expect(page.getByLabel('Recto', { exact: true })).toHaveValue('après')
    await page.getByRole('button', { name: 'Supprimer' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.getByText('Aucune carte')).toBeVisible()
  })
})
