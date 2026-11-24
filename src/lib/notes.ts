import { db, uid } from '../db'
import type { Card, Note, NoteType } from '../types'
import { clozeNumbers } from './cloze'

/** Normalise une liste de tags : minuscules, sans espaces, sans doublons. */
export function normalizeTags(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[\s,;]+/)
  const out = new Set<string>()
  for (const t of raw) {
    const clean = t.trim().replace(/^#/, '').replace(/\s+/g, '-').toLowerCase()
    if (clean) out.add(clean)
  }
  return [...out]
}

/** Numéros de carte (ord) que doit produire une note. */
export function ordsForNote(type: NoteType, front: string): number[] {
  if (type === 'basic') return [0]
  if (type === 'reversed') return [0, 1]
  return clozeNumbers(front).map((n) => n - 1)
}

/** Valide le contenu d'une note ; renvoie un message d'erreur ou null. */
export function validateNote(type: NoteType, front: string, back: string): string | null {
  if (!front.trim()) return type === 'cloze' ? 'Le texte est vide.' : 'Le recto est vide.'
  if (type === 'cloze') {
    if (clozeNumbers(front).length === 0) return 'Ajoutez au moins un trou, par exemple {{c1::réponse}}.'
  } else if (!back.trim()) return 'Le verso est vide.'
  return null
}

function newCard(note: Note, ord: number, now: number): Card {
  return {
    id: uid(),
    noteId: note.id,
    deckId: note.deckId,
    ord,
    due: now,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: null,
  }
}

export interface NoteInput {
  deckId: string
  type: NoteType
  front: string
  back: string
  tags: string[] | string
}

export async function createNote(input: NoteInput): Promise<Note> {
  const err = validateNote(input.type, input.front, input.back)
  if (err) throw new Error(err)
  const now = Date.now()
  const note: Note = {
    id: uid(),
    deckId: input.deckId,
    type: input.type,
    front: input.front,
    back: input.back,
    tags: normalizeTags(input.tags),
    created: now,
    updated: now,
  }
  const cards = ordsForNote(note.type, note.front).map((ord, i) => newCard(note, ord, now + i))
  await db.transaction('rw', db.notes, db.cards, async () => {
    await db.notes.add(note)
    await db.cards.bulkAdd(cards)
  })
  return note
}

/** Met à jour une note et resynchronise ses cartes (ajout/suppression/déplacement). */
export async function updateNote(id: string, patch: Partial<NoteInput>): Promise<Note> {
  return db.transaction('rw', db.notes, db.cards, async () => {
    const old = await db.notes.get(id)
    if (!old) throw new Error('Note introuvable.')
    const next: Note = {
      ...old,
      ...patch,
      tags: patch.tags !== undefined ? normalizeTags(patch.tags) : old.tags,
      updated: Date.now(),
    }
    const err = validateNote(next.type, next.front, next.back)
    if (err) throw new Error(err)
    await db.notes.put(next)

    const existing = await db.cards.where('noteId').equals(id).toArray()
    const wanted = new Set(ordsForNote(next.type, next.front))
    const toDelete = existing.filter((c) => !wanted.has(c.ord)).map((c) => c.id)
    if (toDelete.length) await db.cards.bulkDelete(toDelete)
    const have = new Set(existing.map((c) => c.ord))
    const now = Date.now()
    const toAdd = [...wanted].filter((o) => !have.has(o)).map((o) => newCard(next, o, now))
    if (toAdd.length) await db.cards.bulkAdd(toAdd)
    if (next.deckId !== old.deckId) await db.cards.where('noteId').equals(id).modify({ deckId: next.deckId })
    return next
  })
}

export async function deleteNote(id: string): Promise<void> {
  await db.transaction('rw', db.notes, db.cards, async () => {
    await db.cards.where('noteId').equals(id).delete()
    await db.notes.delete(id)
  })
}

export async function setSuspended(noteId: string, suspended: boolean): Promise<void> {
  await db.cards.where('noteId').equals(noteId).modify({ suspended })
}

/** Tous les tags utilisés, avec leur nombre de notes. */
export async function allTags(): Promise<{ tag: string; count: number }[]> {
  const counts = new Map<string, number>()
  await db.notes.each((n) => n.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)))
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag, 'fr'))
}
