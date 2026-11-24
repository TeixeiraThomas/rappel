import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { DEFAULT_SETTINGS, type Card, type CardState } from '../types'
import { createDeck } from './decks'
import { buildQueue, LEARN_AHEAD_MS } from './queue'

// File d'étude construite par index [état+échéance] : ordre, fenêtres, plafonds, paquets, suspension.

const MIN = 60_000
const DAY = 86_400_000

async function reset() {
  await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.kv.clear()])
}

let seq = 0
function card(deckId: string, state: CardState, due: number, extra: Partial<Card> = {}): Card {
  seq++
  return {
    id: `c${seq}`, noteId: `n${seq}`, deckId, ord: 0, due, stability: state ? 5 : 0, difficulty: state ? 5 : 0,
    scheduledDays: 0, learningSteps: 0, reps: state ? 2 : 0, lapses: 0, state, lastReview: null, ...extra,
  }
}

describe("file d'étude indexée", () => {
  beforeEach(reset)

  it("ordre : apprentissage (échéance croissante), révisions les plus en retard, puis nouvelles", async () => {
    const d = await createDeck('D')
    const now = Date.now()
    const cs = [
      card(d.id, 0, now - 5000), // nouvelle
      card(d.id, 2, now - 3 * DAY), // révision très en retard
      card(d.id, 2, now - 1 * DAY), // révision en retard
      card(d.id, 3, now + 5 * MIN), // réapprentissage dans 5 min
      card(d.id, 1, now + 1 * MIN), // apprentissage dans 1 min
    ]
    await db.cards.bulkAdd(cs)
    const q = await buildQueue(d.id, DEFAULT_SETTINGS, now)
    expect(q.ids).toEqual([cs[4].id, cs[3].id, cs[1].id, cs[2].id, cs[0].id])
    expect(q.counts).toEqual({ new: 1, learn: 2, review: 2 })
  })

  it('exclut les cartes en apprentissage au-delà de la fenêtre de 20 minutes', async () => {
    const d = await createDeck('D')
    const now = Date.now()
    const inside = card(d.id, 1, now + LEARN_AHEAD_MS - MIN)
    const outside = card(d.id, 1, now + LEARN_AHEAD_MS + MIN)
    const reOutside = card(d.id, 3, now + 2 * 3_600_000)
    await db.cards.bulkAdd([inside, outside, reOutside])
    expect((await buildQueue(d.id, DEFAULT_SETTINGS, now)).ids).toEqual([inside.id])
  })

  it("les révisions sont jugées au jour : due plus tard aujourd'hui = proposée, demain = non", async () => {
    const d = await createDeck('D')
    const now = new Date(2026, 5, 10, 10, 0).getTime() // 10 h : la journée d'étude se termine à 4 h le lendemain
    const laterToday = card(d.id, 2, new Date(2026, 5, 10, 22, 0).getTime())
    const tomorrow = card(d.id, 2, new Date(2026, 5, 11, 9, 0).getTime())
    await db.cards.bulkAdd([laterToday, tomorrow])
    expect((await buildQueue(d.id, DEFAULT_SETTINGS, now)).ids).toEqual([laterToday.id])
  })

  it('plafonne les nouvelles cartes dans l’ordre de création, sans lire les autres', async () => {
    const d = await createDeck('D')
    const now = Date.now()
    const cs = Array.from({ length: 50 }, (_, i) => card(d.id, 0, now + i))
    await db.cards.bulkAdd(cs.slice().reverse()) // insertion dans le désordre
    const q = await buildQueue(d.id, { ...DEFAULT_SETTINGS, newPerDay: 7 }, now)
    expect(q.ids).toEqual(cs.slice(0, 7).map((c) => c.id))
  })

  it('limite à 0 nouvelle carte sans erreur', async () => {
    const d = await createDeck('D')
    await db.cards.add(card(d.id, 0, Date.now()))
    expect((await buildQueue(d.id, { ...DEFAULT_SETTINGS, newPerDay: 0 })).ids).toEqual([])
  })

  it('ne mélange pas les paquets : seule la branche demandée est étudiée', async () => {
    const a = await createDeck('A')
    const a1 = await createDeck('A1', a.id)
    const b = await createDeck('B')
    const now = Date.now()
    const ca = card(a.id, 0, now), ca1 = card(a1.id, 0, now + 1), cb = card(b.id, 0, now + 2)
    await db.cards.bulkAdd([ca, ca1, cb])
    expect((await buildQueue(a.id, DEFAULT_SETTINGS, now)).ids).toEqual([ca.id, ca1.id])
    expect((await buildQueue(b.id, DEFAULT_SETTINGS, now)).ids).toEqual([cb.id])
    expect((await buildQueue(null, DEFAULT_SETTINGS, now)).ids).toHaveLength(3)
  })

  it('ignore les cartes suspendues, y compris parmi les nouvelles lues en premier', async () => {
    const d = await createDeck('D')
    const now = Date.now()
    const s1 = card(d.id, 0, now, { suspended: true })
    const s2 = card(d.id, 0, now + 1, { suspended: true })
    const ok = card(d.id, 0, now + 2)
    await db.cards.bulkAdd([s1, s2, ok])
    // plafond de 1 : les suspendues ne doivent pas consommer la place de la carte valide
    expect((await buildQueue(d.id, { ...DEFAULT_SETTINGS, newPerDay: 1 }, now)).ids).toEqual([ok.id])
  })
})
