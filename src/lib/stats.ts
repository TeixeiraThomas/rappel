import type { Card, ReviewLog } from '../types'
import { dayEnd, dayStart } from './queue'

const DAY = 86_400_000

/** Clé « AAAA-MM-JJ » de la journée d'étude contenant `ts` (journée qui change à 4 h). */
export function dayKey(ts: number): string {
  const d = new Date(dayStart(ts))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Nombre de révisions par journée d'étude. */
export function activityByDay(logs: Pick<ReviewLog, 'ts'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of logs) {
    const k = dayKey(l.ts)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/**
 * Série de jours consécutifs avec au moins une révision.
 * Si rien n'a encore été révisé aujourd'hui, la série d'hier reste valide (elle n'est pas encore rompue).
 */
export function computeStreak(activity: Map<string, number>, now: number): { current: number; best: number } {
  let current = 0
  let t = dayStart(now)
  if (!activity.has(dayKey(t))) t = dayStart(t - 1)
  while (activity.has(dayKey(t))) {
    current++
    t = dayStart(t - 1)
  }
  // Meilleure série : parcours des jours triés.
  const keys = [...activity.keys()].sort()
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const k of keys) {
    const [y, m, d] = k.split('-').map(Number)
    const ts = new Date(y, m - 1, d, 12).getTime()
    run = prev !== null && Math.round((ts - prev) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = ts
  }
  return { current, best: Math.max(best, current) }
}

/** Taux de réussite (réponses autres que « À revoir ») sur la période ; null si aucune révision. */
export function successRate(logs: ReviewLog[], sinceTs = 0): { rate: number | null; count: number } {
  const sel = logs.filter((l) => l.ts >= sinceTs)
  if (!sel.length) return { rate: null, count: 0 }
  const ok = sel.filter((l) => l.rating >= 2).length
  return { rate: ok / sel.length, count: sel.length }
}

/**
 * Prévision : nombre de cartes à revoir chaque jour sur `days` jours.
 * L'indice 0 (aujourd'hui) inclut les retards et les cartes en apprentissage.
 */
export function forecast(cards: Card[], now: number, days = 30): number[] {
  const out = new Array<number>(days).fill(0)
  const end = dayEnd(now)
  for (const c of cards) {
    if (c.suspended || c.state === 0) continue
    const idx = c.due < end ? 0 : Math.floor((c.due - end) / DAY) + 1
    if (idx < days) out[idx]++
  }
  return out
}

/** Niveau de couleur 0..4 d'une case du calendrier d'activité. */
export function heatLevel(count: number, max: number): number {
  if (count <= 0) return 0
  if (max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))
}
