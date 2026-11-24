import Dexie from 'dexie'
import { db, uid } from '../db'
import type { Card, Rating, ReviewLog, Settings } from '../types'
import { descendantIds } from './decks'
import type { Outcome } from './scheduler'

/** Les cartes en (ré)apprentissage dues dans les 20 prochaines minutes sont proposées dans la séance. */
export const LEARN_AHEAD_MS = 20 * 60_000
/** Heure de changement de « journée d'étude » (comme Anki : 4 h du matin). */
export const DAY_ROLLOVER_HOUR = 4

/** Début (ms) de la journée d'étude contenant `now`. */
export function dayStart(now: number): number {
  const d = new Date(now)
  d.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0)
  if (d.getTime() > now) d.setDate(d.getDate() - 1)
  return d.getTime()
}

/** Fin (exclue) de la journée d'étude : les révisions « dues aujourd'hui » ont due < cette valeur. */
export function dayEnd(now: number): number {
  const d = new Date(dayStart(now))
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

export interface Counts {
  new: number
  learn: number
  review: number
}

export interface DayProgress {
  newDone: number
  reviewDone: number
}

/** Nombre de nouvelles cartes / révisions déjà faites aujourd'hui (toutes collections confondues). */
export async function progressToday(now: number): Promise<DayProgress> {
  const logs = await db.reviews.where('ts').aboveOrEqual(dayStart(now)).toArray()
  let newDone = 0
  let reviewDone = 0
  for (const l of logs) {
    if (l.state === 0) newDone++
    else if (l.state === 2) reviewDone++
  }
  return { newDone, reviewDone }
}

function limits(settings: Settings, p: DayProgress) {
  return {
    newLeft: Math.max(0, settings.newPerDay - p.newDone),
    reviewLeft: Math.max(0, settings.reviewsPerDay - p.reviewDone),
  }
}

/** Compte, pour chaque paquet, les cartes à étudier (sous-paquets inclus), limites quotidiennes appliquées. */
export async function deckCounts(settings: Settings, now = Date.now()): Promise<Map<string, Counts>> {
  const [decks, cards, progress] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    progressToday(now),
  ])
  const { newLeft, reviewLeft } = limits(settings, progress)
  const end = dayEnd(now)
  const own = new Map<string, Counts>()
  for (const d of decks) own.set(d.id, { new: 0, learn: 0, review: 0 })
  for (const c of cards) {
    if (c.suspended) continue
    const o = own.get(c.deckId)
    if (!o) continue
    if (c.state === 0) o.new++
    else if (c.state === 2) {
      if (c.due < end) o.review++
    } else if (c.due <= now + LEARN_AHEAD_MS) o.learn++
  }
  const result = new Map<string, Counts>()
  for (const d of decks) {
    const sum: Counts = { new: 0, learn: 0, review: 0 }
    for (const id of descendantIds(decks, d.id)) {
      const o = own.get(id)
      if (!o) continue
      sum.new += o.new
      sum.learn += o.learn
      sum.review += o.review
    }
    result.set(d.id, {
      new: Math.min(sum.new, newLeft),
      learn: sum.learn,
      review: Math.min(sum.review, reviewLeft),
    })
  }
  return result
}

export interface StudyQueue {
  ids: string[]
  counts: Counts
}

/**
 * Construit la file d'étude d'un paquet (null = tout) : apprentissage d'abord,
 * puis révisions les plus en retard, puis nouvelles cartes, dans la limite des plafonds du jour.
 */
export async function buildQueue(deckId: string | null, settings: Settings, now = Date.now()): Promise<StudyQueue> {
  const decks = await db.decks.toArray()
  const scope = new Set(deckId ? descendantIds(decks, deckId) : decks.map((d) => d.id))
  const inScope = (c: Card) => !c.suspended && scope.has(c.deckId)
  const { newLeft, reviewLeft } = limits(settings, await progressToday(now))
  const end = dayEnd(now)
  const ahead = now + LEARN_AHEAD_MS
  // Requêtes sur l'index [état+échéance] : on ne lit que les cartes réellement concernées,
  // même avec des dizaines de milliers de cartes (les nouvelles sont lues dans l'ordre, jusqu'au plafond).
  const range = (state: number, upTo: number, inclusive: boolean) =>
    db.cards.where('[state+due]').between([state, Dexie.minKey], [state, upTo], true, inclusive)

  const learn = [...(await range(1, ahead, true).filter(inScope).toArray()), ...(await range(3, ahead, true).filter(inScope).toArray())].sort(
    (a, b) => a.due - b.due,
  )
  const review = (await range(2, end, false).filter(inScope).toArray()).sort((a, b) => a.due - b.due).slice(0, reviewLeft)
  const fresh =
    newLeft > 0
      ? (await db.cards.where('[state+due]').between([0, Dexie.minKey], [0, Dexie.maxKey], true, true).filter(inScope).limit(newLeft).toArray()).sort(
          (a, b) => a.due - b.due || a.ord - b.ord,
        )
      : []

  return {
    ids: [...learn, ...review, ...fresh].map((c) => c.id),
    counts: { new: fresh.length, learn: learn.length, review: review.length },
  }
}

export interface AppliedReview {
  before: Card
  log: ReviewLog
}

/** Construit (sans écrire) l'entrée d'historique d'une réponse : synchrone, pour une interface réactive. */
export function makeReview(before: Card, rating: Rating, outcome: Outcome, durationMs: number, now = Date.now()): AppliedReview {
  const log: ReviewLog = {
    id: uid(),
    cardId: before.id,
    deckId: before.deckId,
    ts: now,
    rating,
    state: before.state,
    scheduledDays: outcome.card.scheduledDays,
    durationMs: Math.round(durationMs),
  }
  return { before, log }
}

/** Écrit la carte mise à jour et l'entrée d'historique (une seule transaction). */
export async function saveReview(applied: AppliedReview, outcome: Outcome): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.put(outcome.card)
    await db.reviews.add(applied.log)
  })
}

/** Enregistre une réponse : met à jour la carte et ajoute une entrée à l'historique. */
export async function applyReview(
  before: Card,
  rating: Rating,
  outcome: Outcome,
  durationMs: number,
  now = Date.now(),
): Promise<AppliedReview> {
  const applied = makeReview(before, rating, outcome, durationMs, now)
  await saveReview(applied, outcome)
  return applied
}

/** Annule la dernière réponse : restaure la carte et supprime l'entrée d'historique. */
export async function undoReview(applied: AppliedReview): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.put(applied.before)
    await db.reviews.delete(applied.log.id)
  })
}
