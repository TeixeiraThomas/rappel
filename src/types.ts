// Types du domaine. Les dates sont stockées en millisecondes (epoch) pour faciliter
// l'indexation IndexedDB et la sérialisation JSON.

/** Type de note : détermine les cartes générées. */
export type NoteType = 'basic' | 'reversed' | 'cloze'

export interface Deck {
  id: string
  name: string
  /** Paquet parent (null = racine). Les sous-paquets forment un arbre. */
  parentId: string | null
  created: number
}

export interface Note {
  id: string
  deckId: string
  type: NoteType
  /** Recto (ou texte à trous pour le type cloze), en Markdown. */
  front: string
  /** Verso (ou « Extra » pour le type cloze), en Markdown. */
  back: string
  tags: string[]
  created: number
  updated: number
}

/** États FSRS (valeurs identiques à ts-fsrs : 0 Nouveau, 1 Apprentissage, 2 Révision, 3 Réapprentissage). */
export type CardState = 0 | 1 | 2 | 3

export interface Card {
  id: string
  noteId: string
  /** Dénormalisé depuis la note pour requêter vite par paquet. */
  deckId: string
  /** Numéro de carte au sein de la note (0/1 pour réversible, n-1 pour cloze cN). */
  ord: number
  due: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: CardState
  lastReview: number | null
  /** Carte suspendue : ignorée en révision. */
  suspended?: boolean
}

/** Note de 1 à 4 : À revoir, Difficile, Bien, Facile. */
export type Rating = 1 | 2 | 3 | 4

export interface ReviewLog {
  id: string
  cardId: string
  deckId: string
  ts: number
  rating: Rating
  /** État de la carte AVANT cette révision. */
  state: CardState
  /** Intervalle planifié (jours) à l'issue de la révision. */
  scheduledDays: number
  /** Durée de réponse en ms. */
  durationMs: number
}

export interface MediaItem {
  id: string
  name: string
  mime: string
  /** Data URL (base64) : simple à sauvegarder/restaurer dans le JSON. */
  data: string
}

export interface Settings {
  newPerDay: number
  reviewsPerDay: number
  /** Rétention visée par FSRS (0.7 – 0.99). */
  retention: number
  maxInterval: number
  /** Mode « taper la réponse » activé par défaut en révision. */
  typedAnswer: boolean
  theme: 'dark' | 'light' | 'auto'
  /** Rappel de sauvegarde tous les N jours (0 = désactivé). */
  backupReminderDays: number
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  reviewsPerDay: 200,
  retention: 0.9,
  maxInterval: 36500,
  typedAnswer: false,
  theme: 'dark',
  backupReminderDays: 7,
}
