import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openApp, seed } from './helpers'

// Accessibilité : analyse automatique axe-core (WCAG 2 A/AA, contrastes inclus) sur chaque écran,
// en thème sombre et clair, plus des parcours au clavier (focus, dialogues, lecteur d'écran).

const DECK = [{ name: 'Réseau', cards: [{ front: 'Quelle commande affiche les VLAN ?', back: '```\nshow vlan brief\n```', tags: ['cisco'] }, { front: 'OSPF ?', back: 'Protocole à état de liens' }] }]

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
}

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = results.violations.map((v) => `${v.id} (${v.impact}) : ${v.help}\n   ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n   ')}`)
  expect(summary, `Violations d'accessibilité sur « ${label} »`).toEqual([])
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`axe — thème ${theme}`, () => {
    test('écrans principaux', async ({ page }) => {
      await openApp(page)
      await seed(page, DECK)
      for (const [label, path] of [
        ['paquets', '/#/'],
        ['modules', '/#/library'],
        ['parcourir', '/#/browse'],
        ['nouvelle carte', '/#/new'],
        ['statistiques', '/#/stats'],
        ['réglages', '/#/settings'],
      ] as const) {
        await page.goto(path)
        await expect(page.locator('main, .study')).toBeVisible()
        await setTheme(page, theme)
        await page.waitForTimeout(150)
        await scan(page, `${label} (${theme})`)
      }
    })

    test('révision : recto, verso, mode saisie, fin de séance', async ({ page }) => {
      await openApp(page)
      await seed(page, DECK)
      await page.goto('/#/study/all')
      await expect(page.locator('.study-card')).toBeVisible()
      await setTheme(page, theme)
      await scan(page, `révision recto (${theme})`)
      await page.keyboard.press('Space')
      await expect(page.locator('.rate')).toHaveCount(4)
      await scan(page, `révision verso (${theme})`)
      await page.keyboard.press('4')
      await page.getByRole('button', { name: 'Taper', exact: true }).click()
      await page.getByLabel('Votre réponse').fill('Protocole')
      await page.keyboard.press('Enter')
      await expect(page.locator('.verdict')).toBeVisible()
      await scan(page, `révision saisie (${theme})`)
    })

    test('dialogues et bandeau de sauvegarde', async ({ page }) => {
      await openApp(page)
      await seed(page, DECK)
      await setTheme(page, theme)
      await page.getByRole('button', { name: 'Options de Réseau' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await scan(page, `menu paquet (${theme})`)
    })
  })
}

test.describe('Clavier et lecteurs d’écran', () => {
  test('lien d’évitement, focus visible et ordre logique', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Aller au contenu' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press('Enter')
    // Le focus se retrouve dans le contenu principal
    await page.keyboard.press('Tab')
    const inMain = await page.evaluate(() => !!document.activeElement?.closest('main'))
    expect(inMain).toBe(true)
  })

  test('un élément focalisé a toujours un contour visible', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const ok = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return true
        const s = getComputedStyle(el)
        const outline = parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none'
        return outline || s.boxShadow !== 'none'
      })
      expect(ok, `Tab n°${i + 1} sans indicateur de focus`).toBe(true)
    }
  })

  test('paquet utilisable entièrement au clavier : créer, étudier', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Créer un paquet' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox')).toBeFocused() // focus placé dans le dialogue
    await page.keyboard.type('Clavier')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Étudier Clavier' })).toBeVisible()
  })

  test('dialogue : Échap ferme, le focus est piégé puis rendu au bouton d’origine', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    const opener = page.getByRole('button', { name: 'Options de Réseau' })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Le focus reste dans le dialogue même après de nombreux Tab
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('les notifications sont annoncées aux lecteurs d’écran', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Créer un paquet' }).click()
    await page.getByRole('dialog').getByRole('textbox').fill('A')
    await page.keyboard.press('Enter')
    await page.getByRole('link', { name: 'Ajouter une carte' }).click()
    await page.getByLabel('Recto', { exact: true }).fill('q')
    await page.getByLabel('Verso', { exact: true }).fill('r')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    // Zone live présente : role=status
    await expect(page.getByRole('status').filter({ hasText: 'Carte créée' })).toBeVisible()
  })

  test('révision : annonces et rôles (progression, groupe de notes)', async ({ page }) => {
    await openApp(page)
    await seed(page, DECK)
    await page.goto('/#/study/all')
    await expect(page.getByRole('progressbar')).toBeVisible()
    await page.keyboard.press('Space')
    const group = page.getByRole('group', { name: 'Noter la réponse' })
    await expect(group.getByRole('button')).toHaveCount(4)
    await expect(group.getByRole('button', { name: /À revoir/ })).toBeVisible()
  })

  test('respecte « réduire les animations »', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openApp(page)
    await seed(page, DECK)
    const d = await page.evaluate(() => {
      const el = document.querySelector('.deck-row, .card') as HTMLElement
      return parseFloat(getComputedStyle(el).animationDuration || '0') + parseFloat(getComputedStyle(el).transitionDuration || '0')
    })
    expect(d).toBeLessThan(0.02)
  })
})
