import Dexie, { type Table } from 'dexie'
import type { Card, Deck, MediaItem, Note, ReviewLog, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

/** Identifiant unique (UUID v4 ; repli si crypto.randomUUID est indisponible). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

class RappelDB extends Dexie {
  decks!: Table<Deck, string>
  notes!: Table<Note, string>
  cards!: Table<Card, string>
  reviews!: Table<ReviewLog, string>
  media!: Table<MediaItem, string>
  /** Stockage clé/valeur (réglages…). */
  kv!: Table<{ key: string; value: unknown }, string>

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
