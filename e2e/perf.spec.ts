import { expect, test } from '@playwright/test'
import { openApp, seed } from './helpers'

// Performance avec une grosse collection : 10 000 cartes réparties en 10 paquets.
// Budgets volontairement généreux : la suite tourne en parallèle avec d'autres tests (4 navigateurs
// se partagent le CPU), les durées mesurées seul sont 3 à 5 fois plus courtes (voir RAPPORT.md).
// Ils détectent les régressions de complexité, pas les micro-variations. Durées jointes au rapport.

const DECKS = 10
const PER_DECK = 1000

test.describe.configure({ mode: 'serial' })

async function ms(f: () => Promise<void>): Promise<number> {
  const t = Date.now()
  await f()
  return Date.now() - t
}

test('collection de 10 000 cartes : accueil, recherche, statistiques, révision', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await openApp(page)

  const t0 = Date.now()
  await seed(
    page,
    Array.from({ length: DECKS }, (_, d) => ({
      name: `Paquet ${String(d + 1).padStart(2, '0')}`,
      cards: Array.from({ length: PER_DECK }, (_, i) => ({
        front: `Question ${d + 1}-${i + 1} : quel est le numéro de port du service n°${i} ?`,
        back: `Réponse ${d + 1}-${i + 1}\n\n\`\`\`\nnetstat -an | grep ${1000 + i}\n\`\`\``,
        tags: [`serie${i % 20}`, d % 2 ? 'impair' : 'pair'],
      })),
    })),
  )
  const seedMs = Date.now() - t0
  const timings: Record<string, number> = { 'insertion de 10 000 cartes (hors app)': seedMs }

  // 1. Accueil : compteurs de tous les paquets (limite de 20 nouvelles/jour globale)
  timings['accueil (rechargement + compteurs)'] = await ms(async () => {
    await page.reload()
    await expect(page.getByRole('button', { name: 'Étudier Paquet 10' })).toBeVisible()
    await expect(page.locator('.deck-counts .badge.new').first()).toHaveText('20')
  })
  expect(timings['accueil (rechargement + compteurs)']).toBeLessThan(8000)

  // 2. Parcourir : premier affichage paginé, puis recherche
  timings['parcourir (affichage)'] = await ms(async () => {
    await page.goto('/#/browse')
    await expect(page.getByText('10000 notes')).toBeVisible()
  })
  expect(await page.locator('.note-item').count()).toBe(100) // pagination : pas 10 000 nœuds DOM
  expect(timings['parcourir (affichage)']).toBeLessThan(8000)

  timings['recherche « service n°999 » '] = await ms(async () => {
    await page.getByRole('searchbox').fill('service n°999')
    await expect(page.getByText(/^10 notes trouvées$/)).toBeVisible()
  })
  expect(timings['recherche « service n°999 » ']).toBeLessThan(5000)

  timings['recherche par tag + paquet'] = await ms(async () => {
    await page.getByRole('searchbox').fill('tag:serie7 deck:"Paquet 03"')
    await expect(page.getByText(/^50 notes trouvées$/)).toBeVisible()
  })
  expect(timings['recherche par tag + paquet']).toBeLessThan(5000)

  // 3. Statistiques
  timings['statistiques'] = await ms(async () => {
    await page.goto('/#/stats')
    await expect(page.getByText('cartes au total')).toBeVisible()
    await expect(page.locator('.kpi .v').last()).toHaveText('10000')
  })
  expect(timings['statistiques']).toBeLessThan(8000)

  // 4. Séance : construction de la file sur toute la collection, puis réponses enchaînées
  timings['démarrage de la séance (file sur 10 000 cartes)'] = await ms(async () => {
    await page.goto('/#/study/all')
    await expect(page.locator('.study-card')).toBeVisible()
  })
  expect(timings['démarrage de la séance (file sur 10 000 cartes)']).toBeLessThan(8000)

  const perRate: number[] = []
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Space')
    await expect(page.locator('.rate')).toHaveCount(4)
    const before = await page.locator('.study-card').innerText()
    perRate.push(
      await ms(async () => {
        await page.keyboard.press('3')
        await expect.poll(async () => page.locator('.study-card').innerText()).not.toBe(before)
      }),
    )
  }
  timings['réponse → carte suivante (moyenne de 5)'] = Math.round(perRate.reduce((a, b) => a + b, 0) / perRate.length)
  expect(timings['réponse → carte suivante (moyenne de 5)']).toBeLessThan(1000)

  // 5. Retour à l'accueil après la séance (les compteurs se recalculent)
  timings['retour à l’accueil après séance'] = await ms(async () => {
    await page.keyboard.press('Escape')
    await expect(page.locator('.deck-counts .badge.new').first()).toHaveText('15')
  })
  expect(timings['retour à l’accueil après séance']).toBeLessThan(6000)

  const report = Object.entries(timings).map(([k, v]) => `${k} : ${v} ms`).join('\n')
  console.log('\nPerformances (10 000 cartes)\n' + report)
  await testInfo.attach('performances.txt', { body: report, contentType: 'text/plain' })
})
