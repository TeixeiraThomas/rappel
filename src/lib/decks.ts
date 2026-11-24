import { db, uid } from '../db'
import type { Deck } from '../types'

export interface DeckNode {
  deck: Deck
  children: DeckNode[]
  /** Nom complet « Parent::Enfant » */
  path: string
  depth: number
}

const byName = (a: Deck, b: Deck) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true })

/** Construit l'arbre des paquets (racines puis enfants triés par nom). */
export function buildTree(decks: Deck[]): DeckNode[] {
  const children = new Map<string | null, Deck[]>()
  const ids = new Set(decks.map((d) => d.id))
  for (const d of decks) {
    // Un parent manquant (données corrompues) est traité comme une racine.
    const key = d.parentId && ids.has(d.parentId) ? d.parentId : null
    children.set(key, [...(children.get(key) ?? []), d])
  }
  const build = (parent: string | null, prefix: string, depth: number): DeckNode[] =>
    (children.get(parent) ?? []).sort(byName).map((deck) => {
      const path = prefix ? `${prefix}::${deck.name}` : deck.name
      return { deck, path, depth, children: build(deck.id, path, depth + 1) }
    })
  return build(null, '', 0)
}

/** Liste à plat (ordre d'affichage de l'arbre). */
export function flattenTree(nodes: DeckNode[]): DeckNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)])
}

/** Identifiants d'un paquet et de tous ses descendants. */
export function descendantIds(decks: Deck[], id: string): string[] {
  const out = [id]
  for (let i = 0; i < out.length; i++) {
    for (const d of decks) if (d.parentId === out[i] && !out.includes(d.id)) out.push(d.id)
  }
  return out
}

export function cleanDeckName(name: string): string {
  return name.replace(/::/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function createDeck(name: string, parentId: string | null = null): Promise<Deck> {
  const clean = cleanDeckName(name)
  if (!clean) throw new Error('Le nom du paquet est vide.')
  const deck: Deck = { id: uid(), name: clean, parentId, created: Date.now() }
  await db.decks.add(deck)
  return deck
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const clean = cleanDeckName(name)
  if (!clean) throw new Error('Le nom du paquet est vide.')
  await db.decks.update(id, { name: clean })
}

/** Déplace un paquet sous un autre (refuse les cycles). */
export async function moveDeck(id: string, newParentId: string | null): Promise<void> {
  const all = await db.decks.toArray()
  if (newParentId && descendantIds(all, id).includes(newParentId)) {
    throw new Error('Impossible de déplacer un paquet dans lui-même ou dans un de ses sous-paquets.')
  }
  await db.decks.update(id, { parentId: newParentId })
}

/** Supprime un paquet, ses sous-paquets, leurs notes et leurs cartes. */
export async function deleteDeck(id: string): Promise<void> {
  const all = await db.decks.toArray()
  const ids = descendantIds(all, id)
  await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
    await db.cards.where('deckId').anyOf(ids).delete()
    await db.notes.where('deckId').anyOf(ids).delete()
    await db.decks.bulkDelete(ids)
  })
}

/** Retrouve ou crée un chemin « A::B::C » et renvoie le paquet feuille. */
export async function getOrCreateDeckPath(path: string): Promise<Deck> {
  const parts = path.split('::').map(cleanDeckName).filter(Boolean)
  if (parts.length === 0) throw new Error('Chemin de paquet vide.')
  let parent: Deck | null = null
  for (const part of parts) {
    const all: Deck[] = await db.decks.toArray()
    const parentId: string | null = parent ? parent.id : null
    const found: Deck | undefined = all.find(
      (d) => (d.parentId ?? null) === parentId && d.name.toLowerCase() === part.toLowerCase(),
    )
    parent = found ?? (await createDeck(part, parentId))
  }
  return parent as Deck
}
