// Tests de non-régression de la planification : les valeurs de référence (instantané) ont été
// enregistrées avec l'ancienne API fsrs().repeat() ; elles doivent rester identiques après toute
// migration de la bibliothèque. Date fixe et fuzz désactivé (le fuzz est aléatoire par nature) →
// résultats reproductibles. Le fuzz est vérifié à part, par bornes.
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Card, type Rating } from '../types'
import { previewAll, prepareScheduler } from './scheduler'

const T0 = Date.UTC(2026, 2, 1, 10, 0, 0)

const fresh = (): Card => ({
  id: 'c', noteId: 'n', deckId: 'd', ord: 0, due: T0, stability: 0, difficulty: 0,
  scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: 0, lastReview: null,
})

/** Vue arrondie d'une carte, stable et lisible dans l'instantané. */
const view = (c: Card, now: number) => ({
  state: c.state,
  dueInMin: Math.round((c.due - now) / 60_000),
  days: c.scheduledDays,
  stab: Math.round(c.stability * 1000) / 1000,
  diff: Math.round(c.difficulty * 1000) / 1000,
  reps: c.reps,
  lapses: c.lapses,
  step: c.learningSteps,
})

/** Rejoue une séquence de notes, chaque révision ayant lieu à l'échéance de la carte. */
async function replay(ratings: Rating[], settings = DEFAULT_SETTINGS, fuzz = false) {
  const sched = await prepareScheduler({ ...settings, fuzz })
  let card = fresh()
  let now = T0
  const steps = []
  for (const r of ratings) {
    const p = previewAll(card, now, sched)
    steps.push({
      rating: r,
      previews: { 1: view(p[1].card, now), 2: view(p[2].card, now), 3: view(p[3].card, now), 4: view(p[4].card, now) },
      labels: [p[1].label, p[2].label, p[3].label, p[4].label],
    })
    card = p[r].card
    now = Math.max(now, card.due)
  }
  return steps
}

describe('FSRS : non-régression', () => {
  it('nouvelle carte : intervalles des 4 boutons', async () => {
    expect(await replay([3])).toMatchSnapshot()
  })

  it('parcours « tout Bien » sur 8 révisions', async () => {
    expect(await replay([3, 3, 3, 3, 3, 3, 3, 3])).toMatchSnapshot()
  })

  it('parcours avec oubli et réapprentissage', async () => {
    expect(await replay([3, 3, 3, 1, 3, 3, 2, 4, 1, 1, 3])).toMatchSnapshot()
  })

  it('parcours « Facile » puis « Difficile »', async () => {
    expect(await replay([4, 4, 2, 2, 3, 4])).toMatchSnapshot()
  })

  it('rétention 80 % et intervalle maximum de 30 jours', async () => {
    expect(await replay([3, 3, 4, 4, 4, 4], { ...DEFAULT_SETTINGS, retention: 0.8, maxInterval: 30 })).toMatchSnapshot()
  })

  it('avec fuzz, les intervalles restent proches de ceux sans fuzz (±15 % ou ±2 j)', async () => {
    const exact = await replay([3, 3, 3, 3, 3, 3], DEFAULT_SETTINGS, false)
    const fuzzy = await replay([3, 3, 3, 3, 3, 3], DEFAULT_SETTINGS, true)
    // Première révision : pas de fuzz en dessous de 2,5 jours -> identique.
    expect(fuzzy[0].previews[3]).toEqual(exact[0].previews[3])
    for (const r of [1, 2, 3, 4] as Rating[]) {
      const a = exact[0].previews[r].days
      const b = fuzzy[0].previews[r].days
      expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(2, a * 0.15))
    }
  })

  it('aperçu cohérent : appliquer une note donne exactement la carte prévue', async () => {
    const sched = await prepareScheduler(DEFAULT_SETTINGS)
    const p = previewAll(fresh(), T0, sched)
    const again = previewAll(fresh(), T0, sched)
    for (const r of [1, 2, 3, 4] as Rating[]) expect(again[r]).toEqual(p[r])
  })
})
