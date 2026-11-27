import { db } from '../db'
import type { ModuleContent, ModuleMeta } from '../modules/types'
import type { Card, Deck, Note, NoteType } from '../types'
import { hasCloze } from './cloze'
import { descendantIds, getOrCreateDeckPath } from './decks'
import { makeNote, normalizeTags, ordsForNote } from './notes'
import { dayEnd } from './queue'

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
export async function installModule(
  meta: Pick<ModuleMeta, 'id' | 'deckName'>,
  content: ModuleContent,
  options: { chapters?: number[] } = {},
): Promise<InstallResult> {
  // Ajout partiel : seulement les chapitres demandés (index dans le programme). L'ordre global est conservé.
  const only = options.chapters ? new Set(options.chapters) : null
  const all = moduleNotes(meta, content)
  const chapterOf = noteChapters(content)
  // Position de chaque note dans le programme complet : fixe l'échéance, donc l'ordre de sortie des nouvelles cartes.
  const wanted = all.map((w, pos) => ({ ...w, pos })).filter((w) => !only || only.has(chapterOf[w.pos]))
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
  wanted.forEach((w) => {
    const old = existing.get(w.front)
    if (old) {
      // Correction du module : seulement si l'utilisateur n'a jamais touché la note. « updated » reste égal à
      // « created » pour que la note continue de recevoir les corrections suivantes.
      if (old.updated === old.created && old.type === w.type && old.back !== w.back) {
        updates.push({ ...old, back: w.back })
      }
      return
    }
    const made = makeNote({ deckId: deckIds.get(w.deckPath)!, type: w.type, front: w.front, back: w.back, tags: w.tags }, base + w.pos * STEP_MS)
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

/** Index du chapitre de chaque note de moduleNotes() (même ordre). */
function noteChapters(content: ModuleContent): number[] {
  return content.chapters.flatMap((ch, i) => ch.cards.map(() => i))
}

/** Avancement des cartes d'un module (ou d'un chapitre). */
export interface Progress {
  /** Notes présentes dans la collection. */
  notes: number
  /** Cartes présentes. */
  cards: number
  /** Cartes déjà vues au moins une fois. */
  seen: number
  /** Cartes acquises : en révision avec un intervalle d'au moins 21 jours. */
  mastered: number
  /** Cartes déjà vues à revoir d'ici la fin de la journée d'étude. */
  due: number
}

export const MASTERED_DAYS = 21

function emptyProgress(): Progress {
  return { notes: 0, cards: 0, seen: 0, mastered: 0, due: 0 }
}

function addCard(p: Progress, c: Card, end: number): void {
  p.cards++
  if (c.state !== 0) p.seen++
  if (c.state === 2 && c.scheduledDays >= MASTERED_DAYS) p.mastered++
  if (c.state !== 0 && !c.suspended && c.due <= end) p.due++
}

/** Avancement de chaque module installé (absent de la Map si le module n'a aucune note). */
export async function modulesProgress(ids: string[], now = Date.now()): Promise<Map<string, Progress>> {
  const end = dayEnd(now)
  const out = new Map<string, Progress>()
  for (const id of ids) {
    const noteIds = await db.notes.where('tags').equals(id).primaryKeys()
    if (!noteIds.length) continue
    const p = emptyProgress()
    p.notes = noteIds.length
    await db.cards.where('noteId').anyOf(noteIds).each((c) => addCard(p, c, end))
    out.set(id, p)
  }
  return out
}

/** Avancement d'un chapitre, avec le sous-paquet où se trouvent ses cartes (null si aucune n'est installée). */
export interface ChapterProgress extends Progress {
  /** Notes prévues par le programme pour ce chapitre. */
  total: number
  deckId: string | null
}

/** Avancement chapitre par chapitre (notes reconnues à leur recto, comme à l'ajout). */
export async function chaptersProgress(
  meta: Pick<ModuleMeta, 'id' | 'deckName'>,
  content: ModuleContent,
  now = Date.now(),
): Promise<ChapterProgress[]> {
  const end = dayEnd(now)
  const chapterOf = noteChapters(content)
  const byFront = new Map(moduleNotes(meta, content).map((n, i) => [n.front, chapterOf[i]] as const))
  const out: ChapterProgress[] = content.chapters.map((ch) => ({ ...emptyProgress(), total: ch.cards.length, deckId: null }))
  const chapterOfNote = new Map<string, number>()
  await db.notes.where('tags').equals(meta.id).each((n) => {
    const i = byFront.get(n.front)
    if (i === undefined) return
    out[i].notes++
    out[i].deckId ??= n.deckId
    chapterOfNote.set(n.id, i)
  })
  if (chapterOfNote.size) {
    await db.cards.where('noteId').anyOf([...chapterOfNote.keys()]).each((c) => addCard(out[chapterOfNote.get(c.noteId)!], c, end))
  }
  return out
}

/**
 * Retire un module : supprime ses notes et leurs cartes, puis les paquets du module devenus vides (le paquet
 * racine compris s'il ne contient plus rien). Les paquets qui contiennent encore des cartes de l'utilisateur
 * sont conservés, de même que l'historique des révisions (statistiques).
 */
export async function removeModule(meta: Pick<ModuleMeta, 'id' | 'deckName'>): Promise<{ notes: number; decks: number }> {
  const root = await moduleRootDeck(meta)
  const noteIds = await db.notes.where('tags').equals(meta.id).primaryKeys()
  if (!root || !noteIds.length) return { notes: 0, decks: 0 }
  let removedDecks = 0
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await db.cards.where('noteId').anyOf(noteIds).delete()
    await db.notes.bulkDelete(noteIds)
    // Élagage de bas en haut : un paquet du module sans note ni sous-paquet restant est supprimé.
    const decks = await db.decks.toArray()
    const subtree = new Set(descendantIds(decks, root))
    let left = decks
    for (;;) {
      const empty: string[] = []
      for (const d of left) {
        if (!subtree.has(d.id)) continue
        if (left.some((x) => x.parentId === d.id)) continue
        if ((await db.notes.where('deckId').equals(d.id).count()) === 0) empty.push(d.id)
      }
      if (!empty.length) break
      await db.decks.bulkDelete(empty)
      removedDecks += empty.length
      left = left.filter((d) => !empty.includes(d.id))
    }
  })
  return { notes: noteIds.length, decks: removedDecks }
}
