import { db } from '../db'
import type { Card, Deck, MediaItem, Note, ReviewLog } from '../types'
import { clearMediaCache } from './media'

export const BACKUP_FORMAT = 'rappel-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  decks: Deck[]
  notes: Note[]
  cards: Card[]
  reviews: ReviewLog[]
  media: MediaItem[]
  settings: unknown
}

/** Sérialise toute la base (paquets, notes, cartes, historique, images, réglages). */
export async function exportBackup(): Promise<Backup> {
  const [decks, notes, cards, reviews, media, settings] = await Promise.all([
    db.decks.toArray(),
    db.notes.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
    db.media.toArray(),
    db.kv.get('settings'),
  ])
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    decks,
    notes,
    cards,
    reviews,
    media,
    settings: settings?.value ?? null,
  }
}

/** Vérifie la structure d'un fichier de sauvegarde ; renvoie un message d'erreur ou null. */
export function validateBackup(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'Fichier invalide.'
  const b = data as Partial<Backup>
  if (b.format !== BACKUP_FORMAT) return "Ce fichier n'est pas une sauvegarde Rappel."
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) return 'Version de sauvegarde non prise en charge (application trop ancienne ?).'
  for (const k of ['decks', 'notes', 'cards', 'reviews', 'media'] as const) {
    if (!Array.isArray(b[k])) return `Sauvegarde corrompue : « ${k} » manquant.`
  }
  // Cohérence minimale : chaque carte doit pointer vers une note de la sauvegarde.
  const noteIds = new Set(b.notes!.map((n) => n.id))
  if (b.cards!.some((c) => !noteIds.has(c.noteId))) return 'Sauvegarde corrompue : cartes sans note.'
  return null
}

export interface RestoreResult {
  decks: number
  notes: number
  cards: number
  reviews: number
}

/**
 * Restaure une sauvegarde.
 * - replace : efface tout puis importe ;
 * - merge   : ajoute/écrase par identifiant, sans rien supprimer.
 */
export async function restoreBackup(data: Backup, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  const err = validateBackup(data)
  if (err) throw new Error(err)
  await db.transaction('rw', [db.decks, db.notes, db.cards, db.reviews, db.media, db.kv], async () => {
    if (mode === 'replace') {
      await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.media.clear()])
    }
    await db.decks.bulkPut(data.decks)
    await db.notes.bulkPut(data.notes)
    await db.cards.bulkPut(data.cards)
    await db.reviews.bulkPut(data.reviews)
    await db.media.bulkPut(data.media)
    if (mode === 'replace' && data.settings) await db.kv.put({ key: 'settings', value: data.settings })
  })
  clearMediaCache()
  return { decks: data.decks.length, notes: data.notes.length, cards: data.cards.length, reviews: data.reviews.length }
}
