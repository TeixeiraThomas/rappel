import type { Note } from '../types'
import { stripCloze } from './cloze'

/** Minuscules sans accents, pour des recherches tolérantes. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface ParsedQuery {
  terms: string[]
  tags: string[]
  /** Fragments de nom de paquet (« deck:reseau »). */
  decks: string[]
  types: string[]
}

/**
 * Syntaxe : mots libres (ET), "phrase exacte", tag:xxx, deck:xxx, type:basic|reversed|cloze.
 */
export function parseQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { terms: [], tags: [], decks: [], types: [] }
  const re = /(\w+):"([^"]*)"|"([^"]*)"|(\S+)/g
  for (const m of q.matchAll(re)) {
    let key: string | null = null
    let val: string
    if (m[1]) {
      key = m[1].toLowerCase()
      val = m[2]
    } else if (m[3] !== undefined) {
      val = m[3]
    } else {
      const tok = m[4]
      const colon = tok.indexOf(':')
      if (colon > 0 && ['tag', 'deck', 'type'].includes(tok.slice(0, colon).toLowerCase())) {
        key = tok.slice(0, colon).toLowerCase()
        val = tok.slice(colon + 1)
      } else val = tok
    }
    val = fold(val.trim())
    if (!val) continue
    if (key === 'tag') out.tags.push(val.replace(/^#/, ''))
    else if (key === 'deck') out.decks.push(val)
    else if (key === 'type') out.types.push(val)
    else out.terms.push(val)
  }
  return out
}

/** `deckPath` : nom complet du paquet de la note (« A::B »). */
export function matchNote(note: Note, p: ParsedQuery, deckPath: string): boolean {
  if (p.types.length && !p.types.some((t) => note.type.startsWith(t))) return false
  if (p.decks.length && !p.decks.every((d) => fold(deckPath).includes(d))) return false
  if (p.tags.length && !p.tags.every((t) => note.tags.some((nt) => fold(nt).includes(t)))) return false
  if (p.terms.length) {
    const hay = fold(`${stripCloze(note.front)}\n${note.back}\n${note.tags.join(' ')}`)
    if (!p.terms.every((t) => hay.includes(t))) return false
  }
  return true
}
