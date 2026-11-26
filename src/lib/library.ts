import { db } from '../db'
import type { ModuleContent, ModuleMeta } from '../modules/types'
import type { Card, Deck, Note, NoteType } from '../types'
import { hasCloze } from './cloze'
import { getOrCreateDeckPath } from './decks'
import { makeNote, normalizeTags, ordsForNote } from './notes'

/** Une note telle que le module la veut, avant écriture en base. */
export interface ModuleNote {
  deckPath: string
  type: NoteType
  front: string
  back: string
  tags: string[]
}

/** Nom du sous-paquet d'un chapitre : numéroté pour garder l'ordre du programme (tri numérique des paquets). */
export function chapterDeckName(index: number, title: string): string {
  return `${index + 1}. ${title}`
}

/** Notes d'un module, dans l'ordre du programme (fonction pure). */
export function moduleNotes(meta: Pick<ModuleMeta, 'id' | 'deckName'>, content: ModuleContent): ModuleNote[] {
  return content.chapters.flatMap((ch, i) =>
    ch.cards.map(([front, back = '', extra = '']) => ({
      deckPath: `${meta.deckName}::${chapterDeckName(i, ch.title)}`,
      type: hasCloze(front) ? ('cloze' as const) : ('basic' as const),
      front: front.trim(),
      back: back.trim(),
      tags: normalizeTags([meta.id, ch.tag, ...extra.split(/\s+/)]),
    })),
  )
}

/** Nombre de notes et de cartes d'un module (pour vérifier le catalogue). */
export function moduleSize(meta: Pick<ModuleMeta, 'id' | 'deckName'>, content: ModuleContent): { notes: number; cards: number } {
  const notes = moduleNotes(meta, content)
  return { notes: notes.length, cards: notes.reduce((s, n) => s + ordsForNote(n.type, n.front).length, 0) }
}

/** Nombre de notes du module déjà présentes dans la collection (reconnues à leur tag). */
export function installedCount(moduleId: string): Promise<number> {
  return db.notes.where('tags').equals(moduleId).count()
}

export interface InstallResult {
  /** Notes ajoutées. */
  added: number
  /** Notes existantes (jamais modifiées par l'utilisateur) dont le contenu a été corrigé. */
  updated: number
  /** Paquet racine du module (à étudier). */
  rootDeckId: string
}

/** Écart entre deux cartes successives dans l'ordre d'apparition (place pour les cartes multiples d'un texte à trous). */
const STEP_MS = 10

/**
 * Ajoute un module, ou le met à jour s'il est déjà là :
 * - les notes déjà présentes (même tag de module + même recto) ne sont pas recréées ;
 * - celles que l'utilisateur n'a jamais modifiées (updated === created) reçoivent les corrections du module ;
 * - les notes manquantes sont créées dans leur chapitre, dans l'ordre du programme ;
 * - rien n'est jamais supprimé ni déplacé.
 */
export async function installModule(meta: Pick<ModuleMeta, 'id' | 'deckName'>, content: ModuleContent): Promise<InstallResult> {
  const wanted = moduleNotes(meta, content)
  const existing = new Map<string, Note>()
  await db.notes.where('tags').equals(meta.id).each((n) => {
    if (!existing.has(n.front)) existing.set(n.front, n)
  })

  const missing = wanted.filter((w) => !existing.has(w.front))
  const deckIds = new Map<string, string>()
  for (const path of new Set(missing.map((w) => w.deckPath))) deckIds.set(path, (await getOrCreateDeckPath(path)).id)

  const base = Date.now()
  const notes: Note[] = []
  const cards: Card[] = []
  const updates: Note[] = []
  wanted.forEach((w, i) => {
    const old = existing.get(w.front)
    if (old) {
      // Correction du module : seulement si l'utilisateur n'a jamais touché la note. « updated » reste égal à
      // « created » pour que la note continue de recevoir les corrections suivantes.
      if (old.updated === old.created && old.type === w.type && old.back !== w.back) {
        updates.push({ ...old, back: w.back })
      }
      return
    }
    const made = makeNote({ deckId: deckIds.get(w.deckPath)!, type: w.type, front: w.front, back: w.back, tags: w.tags }, base + i * STEP_MS)
    notes.push(made.note)
    cards.push(...made.cards)
  })

  if (notes.length || updates.length) {
    await db.transaction('rw', db.notes, db.cards, async () => {
      if (notes.length) await db.notes.bulkAdd(notes)
      if (cards.length) await db.cards.bulkAdd(cards)
      if (updates.length) await db.notes.bulkPut(updates)
    })
  }

  const rootDeckId = (await moduleRootDeck(meta)) ?? (await getOrCreateDeckPath(meta.deckName)).id
  return { added: notes.length, updated: updates.length, rootDeckId }
}

/**
 * Paquet racine d'un module installé : on part du paquet d'une note du module et on remonte jusqu'au paquet
 * portant le nom du module (ou jusqu'à la racine si l'utilisateur l'a renommé). Null si le module n'est pas installé.
 */
export async function moduleRootDeck(meta: Pick<ModuleMeta, 'id' | 'deckName'>): Promise<string | null> {
  const note = await db.notes.where('tags').equals(meta.id).first()
  if (!note) return null
  const decks = new Map((await db.decks.toArray()).map((d) => [d.id, d] as const))
  let deck: Deck | undefined = decks.get(note.deckId)
  const seen = new Set<string>()
  while (deck && !seen.has(deck.id)) {
    seen.add(deck.id)
    if (deck.name.toLowerCase() === meta.deckName.toLowerCase()) return deck.id
    const parent: Deck | undefined = deck.parentId ? decks.get(deck.parentId) : undefined
    if (!parent) return deck.id
    deck = parent
  }
  return note.deckId
}
