// Enveloppe fine autour de ts-fsrs : convertit nos cartes (dates en ms) vers le format
// de la bibliothèque et inversement, et calcule les intervalles affichés sur les boutons.
import { createEmptyCard, fsrs, generatorParameters, type Card as FCard, type Grade } from 'ts-fsrs'
import type { Card, CardState, Rating, Settings } from '../types'

export interface Outcome {
  /** Carte après réponse. */
  card: Card
  /** Délai avant la prochaine échéance, en ms. */
  delayMs: number
  /** Libellé court de l'intervalle (« 10 min », « 3 j »…). */
  label: string
}

type SchedulerParams = SchedulerParams & { fuzz?: boolean }

export type Previews = Record<Rating, Outcome>

export type Scheduler = ReturnType<typeof makeScheduler>

/** Prépare le planificateur (asynchrone : prêt pour l'API actuelle de ts-fsrs). */
export async function prepareScheduler(s: SchedulerParams): Promise<Scheduler> {
  return makeScheduler(s)
}

function makeScheduler(s: SchedulerParams) {
  return fsrs(
    generatorParameters({
      request_retention: s.retention,
      maximum_interval: s.maxInterval,
      enable_fuzz: s.fuzz ?? true,
    }),
  )
}

function toFsrs(c: Card, now: number): FCard {
  if (c.state === 0) return createEmptyCard(new Date(now))
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.lastReview ? new Date(c.lastReview) : undefined,
  } as FCard
}

function fromFsrs(base: Card, f: FCard): Card {
  return {
    ...base,
    due: f.due.getTime(),
    stability: f.stability,
    difficulty: f.difficulty,
    scheduledDays: f.scheduled_days,
    learningSteps: f.learning_steps,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state as CardState,
    lastReview: f.last_review ? f.last_review.getTime() : null,
  }
}

/** Libellé compact d'un délai : « 1 min », « 3 h », « 5 j », « 2,5 mois », « 1,2 an ». */
export function formatDelay(ms: number): string {
  const min = ms / 60_000
  if (min < 1) return '< 1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = min / 60
  if (h < 24) return `${Math.round(h)} h`
  const d = h / 24
  if (d < 30) return `${Math.round(d)} j`
  const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',')
  if (d < 365) return `${num(d / 30)} mois`
  return `${num(d / 365)} an${d / 365 >= 2 ? 's' : ''}`
}

/** Calcule d'un coup le résultat des 4 réponses possibles (affichage + application cohérents). */
export function previewAll(card: Card, now: number, f: Scheduler): Previews {
  const rec = f.repeat(toFsrs(card, now), new Date(now))
  const out = {} as Previews
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const item = rec[r as Grade]
    const next = fromFsrs(card, item.card)
    const delayMs = Math.max(0, next.due - now)
    out[r] = { card: next, delayMs, label: formatDelay(delayMs) }
  }
  return out
}
