import { beforeEach, describe, expect, it } from 'vitest'
import { db, getSettings } from '../db'
import { DEFAULT_SETTINGS, type Settings } from '../types'
import { createDeck } from './decks'
import { createNote } from './notes'
import { applyReview, buildQueue, dayEnd, dayStart, deckCounts, undoReview } from './queue'
import { formatDelay, previewAll } from './scheduler'
import { compareAnswer, levenshtein } from './typed'

async function reset() {
  await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.kv.clear()])
}

describe('planification FSRS', () => {
  beforeEach(reset)

  it("propose 4 intervalles croissants pour une carte neuve", async () => {
    const d = await createDeck('D')
    await createNote({ deckId: d.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    const card = (await db.cards.toArray())[0]
    const now = Date.now()
    const p = previewAll(card, now, DEFAULT_SETTINGS)
    expect(p[1].delayMs).toBeLessThanOrEqual(p[2].delayMs)
    expect(p[2].delayMs).toBeLessThanOrEqual(p[3].delayMs)
    expect(p[3].delayMs).toBeLessThan(p[4].delayMs)
    // « À revoir » reste en apprentissage, « Facile » sort en révision avec un intervalle en jours.
    expect(p[1].card.state).toBe(1)
    expect(p[4].card.state).toBe(2)
    expect(p[4].label).toMatch(/j|mois/)
  })

  it("« Bien » sur une carte de révision allonge l'intervalle", async () => {
    const d = await createDeck('D')
    await createNote({ deckId: d.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    let card = (await db.cards.toArray())[0]
    let now = Date.now()
    card = previewAll(card, now, DEFAULT_SETTINGS)[4].card // Facile -> révision
    const first = card.scheduledDays
    now = card.due
    const next = previewAll(card, now, DEFAULT_SETTINGS)[3].card
    expect(next.scheduledDays).toBeGreaterThan(first)
    expect(next.reps).toBe(2)
  })

  it('« À revoir » sur une révision compte un oubli', async () => {
    const d = await createDeck('D')
    await createNote({ deckId: d.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    let card = (await db.cards.toArray())[0]
    let now = Date.now()
    card = previewAll(card, now, DEFAULT_SETTINGS)[4].card
    now = card.due
    const lapsed = previewAll(card, now, DEFAULT_SETTINGS)[1].card
    expect(lapsed.lapses).toBe(1)
    expect(lapsed.state).toBe(3)
  })

  it('formate les délais', () => {
    expect(formatDelay(30_000)).toBe('< 1 min')
    expect(formatDelay(10 * 60_000)).toBe('10 min')
    expect(formatDelay(3 * 3_600_000)).toBe('3 h')
    expect(formatDelay(5 * 86_400_000)).toBe('5 j')
    expect(formatDelay(75 * 86_400_000)).toBe('2,5 mois')
    expect(formatDelay(400 * 86_400_000)).toBe('1,1 an')
  })
})

describe("file d'étude et limites", () => {
  beforeEach(reset)
  const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...o })

  async function seed(n: number) {
    const d = await createDeck('D')
    for (let i = 0; i < n; i++) await createNote({ deckId: d.id, type: 'basic', front: `q${i}`, back: `r${i}`, tags: [] })
    return d
  }

  it('respecte la limite de nouvelles cartes', async () => {
    const d = await seed(30)
    const q = await buildQueue(d.id, settings({ newPerDay: 10 }))
    expect(q.ids).toHaveLength(10)
    expect(q.counts.new).toBe(10)
  })

  it('décompte les nouvelles cartes déjà vues aujourd’hui', async () => {
    const d = await seed(30)
    const s = settings({ newPerDay: 10 })
    for (let i = 0; i < 4; i++) {
      // on prend une carte neuve (les cartes en apprentissage passent en tête de file)
      const card = (await db.cards.where('state').equals(0).first())!
      const out = previewAll(card, Date.now(), s)[3]
      await applyReview(card, 3, out, 1000)
    }
    // 4 faites sur 10 : il reste 6 nouvelles, plus d'éventuelles cartes en apprentissage.
    const q = await buildQueue(d.id, s)
    expect(q.counts.new).toBe(6)
    const counts = await deckCounts(s)
    expect(counts.get(d.id)!.new).toBe(6)
  })

  it('limite les révisions du jour', async () => {
    const d = await seed(5)
    const now = Date.now()
    await db.cards.toCollection().modify({ state: 2, due: now - 1000, stability: 5, difficulty: 5, reps: 3 })
    const q = await buildQueue(d.id, settings({ reviewsPerDay: 3 }))
    expect(q.counts.review).toBe(3)
  })

  it('ignore les cartes suspendues et les révisions futures', async () => {
    const d = await seed(3)
    const cards = await db.cards.toArray()
    await db.cards.update(cards[0].id, { suspended: true })
    await db.cards.update(cards[1].id, { state: 2, due: Date.now() + 5 * 86_400_000 })
    const q = await buildQueue(d.id, settings())
    expect(q.ids).toEqual([cards[2].id])
  })

  it('inclut les sous-paquets', async () => {
    const parent = await createDeck('P')
    const child = await createDeck('C', parent.id)
    await createNote({ deckId: child.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    expect((await buildQueue(parent.id, settings())).ids).toHaveLength(1)
    expect((await deckCounts(settings())).get(parent.id)!.new).toBe(1)
  })

  it("annule une réponse (carte et historique restaurés)", async () => {
    const d = await seed(1)
    const s = await getSettings()
    const card = (await db.cards.toArray())[0]
    const out = previewAll(card, Date.now(), s)[3]
    const applied = await applyReview(card, 3, out, 500)
    expect((await db.cards.get(card.id))!.state).not.toBe(0)
    expect(await db.reviews.count()).toBe(1)
    await undoReview(applied)
    expect((await db.cards.get(card.id))!.state).toBe(0)
    expect(await db.reviews.count()).toBe(0)
    expect(d.id).toBeTruthy()
  })

  it("calcule les bornes de la journée d'étude (4 h)", () => {
    const t = new Date(2026, 5, 10, 2, 30).getTime() // 02:30 -> appartient à la veille
    expect(new Date(dayStart(t)).getDate()).toBe(9)
    const t2 = new Date(2026, 5, 10, 15, 0).getTime()
    expect(new Date(dayStart(t2)).getDate()).toBe(10)
    expect(dayEnd(t2) - dayStart(t2)).toBe(86_400_000)
  })
})

describe('saisie de la réponse', () => {
  it('reconnaît exact / correct / proche / faux', () => {
    expect(compareAnswer('show ip route', 'show ip route').verdict).toBe('exact')
    expect(compareAnswer('Show IP Route.', 'show ip route').verdict).toBe('correct')
    expect(compareAnswer('Électricité', 'electricite').verdict).toBe('correct')
    expect(compareAnswer('show ip rotue', 'show ip route').verdict).toBe('close')
    expect(compareAnswer('show vlan', 'show ip route').verdict).toBe('wrong')
    expect(compareAnswer('', 'quelque chose').verdict).toBe('wrong')
  })
  it('suggère une note', () => {
    expect(compareAnswer('abc', 'abc').suggested).toBe(3)
    expect(compareAnswer('show ip rotue', 'show ip route').suggested).toBe(2)
    expect(compareAnswer('x', 'tout autre chose').suggested).toBe(1)
  })
  it('annote les différences', () => {
    const c = compareAnswer('cat', 'cut')
    expect(c.typedParts.some((p) => p.kind === 'extra' && p.text === 'a')).toBe(true)
    expect(c.expectedParts.some((p) => p.kind === 'missing' && p.text === 'u')).toBe(true)
  })
  it('calcule Levenshtein', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
  })
})
