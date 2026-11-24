import { describe, expect, it } from 'vitest'
import type { Card, ReviewLog } from '../types'
import { activityByDay, computeStreak, dayKey, forecast, heatLevel, successRate } from './stats'

const at = (d: number, h = 12) => new Date(2026, 5, d, h).getTime()
const log = (ts: number, rating: 1 | 2 | 3 | 4 = 3): ReviewLog => ({ id: String(ts), cardId: 'c', deckId: 'd', ts, rating, state: 2, scheduledDays: 1, durationMs: 1 })
const card = (due: number, state: 0 | 1 | 2 | 3 = 2, extra: Partial<Card> = {}): Card => ({
  id: String(due), noteId: 'n', deckId: 'd', ord: 0, due, stability: 1, difficulty: 5, scheduledDays: 1, learningSteps: 0, reps: 1, lapses: 0, state, lastReview: null, ...extra,
})

describe('statistiques', () => {
  it('rattache une révision de 2 h du matin à la veille', () => {
    expect(dayKey(at(10, 2))).toBe(dayKey(at(9, 20)))
    expect(dayKey(at(10, 5))).not.toBe(dayKey(at(9, 20)))
  })

  it('calcule la série en cours (aujourd’hui fait)', () => {
    const a = activityByDay([log(at(10)), log(at(9)), log(at(8)), log(at(5))])
    expect(computeStreak(a, at(10, 18))).toEqual({ current: 3, best: 3 })
  })

  it('garde la série d’hier tant qu’on n’a pas révisé aujourd’hui', () => {
    const a = activityByDay([log(at(9)), log(at(8))])
    expect(computeStreak(a, at(10, 9)).current).toBe(2)
  })

  it('remet la série à zéro après un jour manqué', () => {
    const a = activityByDay([log(at(7)), log(at(6))])
    expect(computeStreak(a, at(10, 9))).toEqual({ current: 0, best: 2 })
  })

  it('calcule le taux de réussite', () => {
    const logs = [log(at(10), 1), log(at(10), 3), log(at(10), 4), log(at(10), 2), log(at(1), 1)]
    expect(successRate(logs, at(5))).toEqual({ rate: 0.75, count: 4 })
    expect(successRate([], 0).rate).toBeNull()
  })

  it('prévoit les révisions à venir', () => {
    const now = at(10, 10)
    const cards = [
      card(now - 3 * 86_400_000), // en retard -> aujourd'hui
      card(now + 3_600_000), // plus tard aujourd'hui
      card(now + 86_400_000), // demain
      card(now + 5 * 86_400_000),
      card(now + 90 * 86_400_000), // hors fenêtre
      card(now, 0), // nouvelle : ignorée
      card(now, 2, { suspended: true }), // suspendue : ignorée
    ]
    const f = forecast(cards, now, 30)
    expect(f[0]).toBe(2)
    expect(f[1]).toBe(1)
    expect(f[5]).toBe(1)
    expect(f.reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('niveaux de couleur', () => {
    expect(heatLevel(0, 10)).toBe(0)
    expect(heatLevel(1, 100)).toBe(1)
    expect(heatLevel(100, 100)).toBe(4)
  })
})
