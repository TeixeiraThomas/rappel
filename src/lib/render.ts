import type { Note } from '../types'
import { clozeAnswers, renderCloze } from './cloze'
import { mdToPlain } from './markdown'

export interface CardFaces {
  /** Markdown du recto. */
  front: string
  /** Markdown du verso. */
  back: string
  /** Si vrai, le verso contient déjà le recto (cloze) : on ne le répète pas. */
  backIncludesFront: boolean
  /** Réponse attendue en texte brut (mode « taper la réponse »). */
  expected: string
}

/** Calcule le recto/verso d'une carte (ord) à partir de sa note. */
export function cardFaces(note: Note, ord: number): CardFaces {
  if (note.type === 'cloze') {
    const n = ord + 1
    const answers = clozeAnswers(note.front, n).map(mdToPlain)
    return {
      front: renderCloze(note.front, n, 'front'),
      back: renderCloze(note.front, n, 'back') + (note.back.trim() ? `\n\n${note.back}` : ''),
      backIncludesFront: true,
      expected: answers.join(', '),
    }
  }
  if (note.type === 'reversed' && ord === 1) {
    return { front: note.back, back: note.front, backIncludesFront: false, expected: mdToPlain(note.front) }
  }
  return { front: note.front, back: note.back, backIncludesFront: false, expected: mdToPlain(note.back) }
}
