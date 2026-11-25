import { expect, test, type Page } from '@playwright/test'
import { openApp, readTable, seed } from './helpers'

const CARDS = [
  { front: 'Capitale de la France ?', back: 'Paris' },
  { front: 'Capitale du Royaume-Uni ?', back: 'Londres' },
  { front: 'Capitale de l’Italie ?', back: 'Rome' },
]

async function startStudy(page: Page, cards = CARDS) {
  await openApp(page)
  await seed(page, [{ name: 'Capitales', cards }])
  await page.getByRole('button', { name: 'Étudier Capitales' }).click()
  await expect(page.locator('.study-card')).toBeVisible()
}

/** Affiche la réponse au clavier et attend que les 4 boutons soient rendus. */
async function reveal(page: Page) {
  await page.keyboard.press('Space')
  await expect(page.locator('.rate')).toHaveCount(4)
}

type Log = { rating: number; state: number }
const logs = (page: Page) => readTable<Log>(page, 'reviews')

test.describe('Révision au clavier', () => {
  test('espace, notes 1-4, attente des cartes en apprentissage, fin de séance', async ({ page }) => {
    await startStudy(page)
    // Boutons : intervalles affichés et touches
    await reveal(page)
    const labels = await page.locator('.rate small').allInnerTexts()
    // « Facile » est fuzzé (±2 j autour de 8 j) ; les autres sont fixes.
    expect(labels.slice(0, 3)).toEqual(['1 min', '6 min', '10 min'])
    expect(labels[3]).toMatch(/^([6-9]|10) j$/)

    await page.keyboard.press('4') // Facile
    await expect(page.locator('.study-card')).toContainText('Royaume-Uni')
    await reveal(page)
    await page.keyboard.press('4')
    // Dernière carte : « À revoir » => elle repasse en apprentissage, il n'y a plus qu'elle
    await reveal(page)
    await page.keyboard.press('1')
    await expect(page.getByRole('heading', { name: /Prochaine carte dans/ })).toBeVisible()
    await page.getByRole('button', { name: 'Continuer maintenant' }).click()
    await expect(page.locator('.study-card')).toContainText('Italie')
    await reveal(page)
    await page.keyboard.press('4')
    await expect(page.getByRole('heading', { name: /Séance terminée/ })).toBeVisible()
    await expect(page.getByText('4 cartes révisées')).toBeVisible()

    const l = await logs(page)
    expect(l.map((x) => x.rating).sort()).toEqual([1, 4, 4, 4])
  })

  test('Espace après révélation = « Bien », Z annule la dernière réponse', async ({ page }) => {
    await startStudy(page)
    await reveal(page)
    await page.keyboard.press('Space') // Bien
    await expect.poll(async () => (await logs(page)).map((x) => x.rating)).toEqual([3])
    // La carte 1 est en apprentissage : la carte 2 est affichée
    await expect(page.locator('.study-card')).toContainText('Royaume-Uni')
    await page.keyboard.press('z')
    await expect(page.locator('.study-card')).toContainText('France')
    await expect.poll(async () => (await logs(page)).length).toBe(0)
  })

  test('Z annule aussi sur l’écran d’attente « Prochaine carte dans… »', async ({ page }) => {
    await startStudy(page, [CARDS[0]])
    await reveal(page)
    await page.keyboard.press('3') // Bien → la seule carte passe en apprentissage : écran d'attente
    await expect(page.getByRole('heading', { name: /Prochaine carte dans/ })).toBeVisible()
    await expect.poll(async () => (await logs(page)).length).toBe(1)
    await page.keyboard.press('z')
    await expect(page.locator('.study-card')).toContainText('France')
    await expect.poll(async () => (await logs(page)).length).toBe(0)
  })

  test('Z annule aussi sur l’écran de fin de séance', async ({ page }) => {
    await startStudy(page, [CARDS[0]])
    await reveal(page)
    await page.keyboard.press('4') // Facile → plus rien aujourd'hui : fin de séance
    await expect(page.getByRole('heading', { name: /Séance terminée/ })).toBeVisible()
    await page.keyboard.press('z')
    await expect(page.locator('.study-card')).toContainText('France')
    await expect.poll(async () => (await logs(page)).length).toBe(0)
  })

  test('Échap quitte la séance', async ({ page }) => {
    await startStudy(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Paquets', level: 1 })).toBeVisible()
  })

  test('toucher la carte (ou le bouton) affiche la réponse', async ({ page }) => {
    await startStudy(page)
    await page.locator('.study-card').click()
    await expect(page.locator('.study-card')).toContainText('Paris')
    await expect(page.locator('.rate')).toHaveCount(4)
  })
})

test.describe('Mode « taper la réponse »', () => {
  test('exact, presque et incorrect avec les différences', async ({ page }) => {
    await startStudy(page)
    await page.getByRole('button', { name: 'Taper', exact: true }).click()
    const box = page.getByLabel('Votre réponse')

    // 1. Réponse correcte (casse ignorée) → « Bien » suggéré
    await box.fill('paris')
    await box.press('Enter')
    await expect(page.getByText('✓ Correct')).toBeVisible()
    await expect(page.locator('.rate.r3.suggested')).toBeVisible()
    await page.keyboard.press('Space') // applique la note suggérée (Bien)

    // 2. Faute de frappe → « Presque », « Difficile » suggéré, différences visibles
    await expect(page.locator('.study-card')).toContainText('Royaume-Uni')
    await box.fill('Lndres')
    await box.press('Enter')
    await expect(page.getByText('≈ Presque')).toBeVisible()
    await expect(page.locator('.rate.r2.suggested')).toBeVisible()
    await expect(page.locator('.diff .missing').first()).toHaveText('o')
    await page.keyboard.press('2')

    // 3. Mauvaise réponse → « À revoir » suggéré
    await expect(page.locator('.study-card')).toContainText('Italie')
    await box.fill('Milan')
    await box.press('Enter')
    await expect(page.getByText('✗ Incorrect')).toBeVisible()
    await expect(page.locator('.rate.r1.suggested')).toBeVisible()
    await expect(page.locator('.diff').nth(1)).toHaveText('Rome')
  })

  test('le bouton affiche Entrée (et non Espace), et l’explication entre parenthèses est ignorée', async ({ page }) => {
    await startStudy(page, [{ front: 'Hôtes utilisables dans un /27 ?', back: '30 (2^5 - 2)' }])
    await page.getByRole('button', { name: 'Taper', exact: true }).click()
    const verify = page.getByRole('button', { name: /Vérifier/ })
    await expect(verify.locator('.kbd')).toHaveText('Entrée')
    await expect(page.locator('.shortcuts')).toContainText('Entrée : vérifier')
    const box = page.getByLabel('Votre réponse')
    await box.fill('30')
    await box.press('Enter')
    await expect(page.getByText('✓ Exact')).toBeVisible()
    await expect(page.locator('.rate.r3.suggested')).toBeVisible()
  })

  test('sans le mode « taper », le bouton affiche toujours Espace', async ({ page }) => {
    await startStudy(page)
    await expect(page.getByRole('button', { name: /Afficher la réponse/ }).locator('.kbd')).toHaveText('Espace')
  })

  test('le choix du mode est mémorisé', async ({ page }) => {
    await startStudy(page)
    await page.getByRole('button', { name: 'Taper', exact: true }).click()
    await page.reload()
    await expect(page.getByLabel('Votre réponse')).toBeVisible()
  })
})

test.describe('Balayage tactile', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'nécessite un profil tactile (iPhone / Android)')

  /** Simule un glissement du doigt (événements tactiles réels via le protocole DevTools). */
  async function swipe(page: Page, dx: number) {
    const cdp = await page.context().newCDPSession(page)
    const box = (await page.locator('.study-card').boundingBox())!
    const y = box.y + box.height / 2
    const x0 = box.x + box.width / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
    const steps = 12
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y }] })
      await page.waitForTimeout(16) // ~60 images/s, comme un vrai doigt
    }
    await page.waitForTimeout(150) // le doigt marque une pause avant de se lever : pas d'inertie (fling)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  test('avant révélation, un balayage ne note pas la carte', async ({ page }) => {
    await startStudy(page)
    await swipe(page, -220)
    await page.waitForTimeout(300)
    await expect.poll(async () => (await logs(page)).length).toBe(0)
    await expect(page.locator('.study-card')).toContainText('France')
    await expect(page.locator('.rate')).toHaveCount(0)
  })

  test('gauche = À revoir, droite = Bien, balayage trop court = annulé', async ({ page }) => {
    await startStudy(page)
    await page.locator('.study-card').tap()
    await expect(page.locator('.rate')).toHaveCount(4)

    // Balayage trop court : la carte revient en place, aucune note
    await swipe(page, 40)
    await page.waitForTimeout(300)
    await expect.poll(async () => (await logs(page)).length).toBe(0)
    await expect(page.locator('.rate')).toHaveCount(4)

    await swipe(page, -220) // gauche → À revoir
    await expect.poll(async () => (await logs(page)).map((x) => x.rating)).toEqual([1])
    await expect(page.locator('.study-card')).toContainText('Royaume-Uni')

    await page.getByRole('button', { name: /Afficher la réponse/ }).tap()
    await expect(page.locator('.rate')).toHaveCount(4)
    await swipe(page, 220) // droite → Bien
    await expect.poll(async () => (await logs(page)).map((x) => x.rating).sort()).toEqual([1, 3])
  })

  test('les 4 boutons restent utilisables au toucher', async ({ page }) => {
    await startStudy(page)
    await page.getByRole('button', { name: /Afficher la réponse/ }).tap()
    await page.getByRole('button', { name: /Difficile/ }).tap()
    await expect.poll(async () => (await logs(page)).map((x) => x.rating)).toEqual([2])
  })
})
