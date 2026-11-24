// Enveloppe fine autour de ts-fsrs (API actuelle « DefaultScheduler ») : convertit nos cartes
// (dates en ms) vers le format de la bibliothèque et inversement, et calcule les intervalles
// affichés sur les boutons.
import { DefaultScheduler } from 'ts-fsrs'
import type { Card, CardState, Rating, Settings } from '../types'

export interface Outcome {
  /** Carte après réponse. */
  card: Card
  /** Délai avant la prochaine échéance, en ms. */
  delayMs: number
  /** Libellé court de l'intervalle (« 10 min », « 3 j »…). */
  label: string
}

export type Previews = Record<Rating, Outcome>

/** `fuzz` : légère variation aléatoire des intervalles longs (activée par défaut ; désactivée dans les tests déterministes). */
type SchedulerParams = Pick<Settings, 'retention' | 'maxInterval'> & { fuzz?: boolean }
export type Scheduler = Awaited<ReturnType<typeof createScheduler>>

// FSRS-6 : même modèle que l'ancienne API fsrs() (comportement inchangé). Le défaut de la
// bibliothèque est désormais FSRS-7, volontairement non adopté ici pour ne pas changer les intervalles.
function createScheduler(s: SchedulerParams) {
  return DefaultScheduler({
    version: 'FSRS-6',
    desiredRetention: s.retention,
    maximumInterval: s.maxInterval,
    enableFuzz: s.fuzz ?? true,
  })
}

/** Prépare le planificateur (asynchrone, à faire une fois avant la séance). */
export async function prepareScheduler(s: SchedulerParams): Promise<Scheduler> {
  return createScheduler(s)
}

// Le réapprentissage (état 3) est un statut « learning » côté bibliothèque.
const STATUS = ['new', 'learning', 'review', 'learning'] as const

function toFsrs(f: Scheduler, c: Card, now: number) {
  if (c.state === 0) return f.newCard({ now: new Date(now), cardId: c.id })
  return {
    stability: c.stability,
    difficulty: c.difficulty,
    state: c.state,
    scheduleStatus: STATUS[c.state],
    dueAt: new Date(c.due),
    lastReviewAt: c.lastReview ? new Date(c.lastReview) : null,
    cardId: c.id,
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduledDays,
    learningStep: c.learningSteps,
  }
}

function fromFsrs(base: Card, f: ReturnType<typeof toFsrs>): Card {
  return {
    ...base,
    due: f.dueAt.getTime(),
    stability: f.stability,
    difficulty: f.difficulty,
    scheduledDays: f.scheduledDays,
    learningSteps: f.learningStep,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state as CardState,
    lastReview: f.lastReviewAt ? f.lastReviewAt.getTime() : null,
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
  const date = new Date(now)
  const out = {} as Previews
  for (const item of f.preview({ card: toFsrs(f, card, now), now: date })) {
    const r = item.grade as Rating
    const next = fromFsrs(card, item.card as ReturnType<typeof toFsrs>)
    const delayMs = Math.max(0, next.due - now)
    out[r] = { card: next, delayMs, label: formatDelay(delayMs) }
  }
  return out
}
