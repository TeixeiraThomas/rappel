import Dexie, { type Table } from 'dexie'
import type { Card, Deck, MediaItem, Note, ReviewLog, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'
import { installSyncTracking, type Tombstone } from './lib/syncTracking'

/** Identifiant unique (UUID v4 ; repli si crypto.randomUUID est indisponible). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export class RappelDB extends Dexie {
  decks!: Table<Deck, string>
  notes!: Table<Note, string>
  cards!: Table<Card, string>
  reviews!: Table<ReviewLog, string>
  media!: Table<MediaItem, string>
  /** Stockage clé/valeur (réglages…). */
  kv!: Table<{ key: string; value: unknown }, string>
  /** Suppressions locales en attente d'envoi au serveur (synchronisation). */
  tombstones!: Table<Tombstone, string>
  /** Attend l'écriture des dernières pierres tombales (installé par installSyncTracking). */
  waitTombstones!: () => Promise<void>

  constructor(name = 'rappel') {
    super(name)
    this.version(1).stores({
      decks: 'id, parentId',
      notes: 'id, deckId, *tags, updated',
      cards: 'id, noteId, deckId, due, state, [deckId+state]',
      reviews: 'id, cardId, deckId, ts',
      media: 'id',
      kv: 'key',
    })
    // v2 : index sur la date de création des notes (rappel de sauvegarde).
    this.version(2).stores({ notes: 'id, deckId, *tags, updated, created' })
    // v3 : index composé [état+échéance] pour construire la file d'étude sans lire toute la collection.
    this.version(3).stores({ cards: 'id, noteId, deckId, due, state, [deckId+state], [state+due]' })
    // v4 : suppressions à propager lors de la synchronisation entre appareils.
    this.version(4).stores({ tombstones: 'key' })
    installSyncTracking(this)
  }
}

export const db = new RappelDB()

/** Lit les réglages, complétés par les valeurs par défaut. */
export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await db.kv.put({ key: 'settings', value: next })
  return next
}
