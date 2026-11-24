import { db } from '../db'
import type { NoteType } from '../types'
import { hasCloze } from './cloze'
import { createNote, normalizeTags } from './notes'

/** Analyse un CSV (guillemets « " » avec doublement, retours à la ligne dans les champs, BOM, CRLF). */
export function parseCsv(text: string, delimiter = ';'): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"' && field === '') inQuotes = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Devine le séparateur d'après la première ligne (« ; » par défaut). */
export function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  const count = (c: string) => first.split(c).length - 1
  const best = [';', '\t', ','].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ';'
}

export interface CsvCard {
  front: string
  back: string
  tags: string[]
  type: NoteType
}

export interface CsvParsed {
  cards: CsvCard[]
  /** Lignes ignorées (invalides), numérotées à partir de 1. */
  invalid: number[]
  hadHeader: boolean
}

const HEADER_FRONT = ['recto', 'front', 'question', 'devant']

/** Transforme les lignes recto;verso;tags en cartes. Un recto contenant {{c1::…}} devient une carte à trous. */
export function csvToCards(rows: string[][]): CsvParsed {
  let start = 0
  let hadHeader = false
  if (rows[0] && HEADER_FRONT.includes((rows[0][0] ?? '').trim().toLowerCase())) {
    start = 1
    hadHeader = true
  }
  const cards: CsvCard[] = []
  const invalid: number[] = []
  for (let i = start; i < rows.length; i++) {
    const [front = '', back = '', tags = ''] = rows[i].map((c) => c.trim())
    if (hasCloze(front)) cards.push({ front, back, tags: normalizeTags(tags), type: 'cloze' })
    else if (front && back) cards.push({ front, back, tags: normalizeTags(tags), type: 'basic' })
    else invalid.push(i + 1)
  }
  return { cards, invalid, hadHeader }
}

export interface CsvImportResult {
  added: number
  duplicates: number
}

/** Importe les cartes dans un paquet ; les doublons (même recto + verso) sont ignorés. */
export async function importCards(cards: CsvCard[], deckId: string, skipDuplicates = true): Promise<CsvImportResult> {
  const seen = new Set<string>()
  if (skipDuplicates) {
    await db.notes.where('deckId').equals(deckId).each((n) => seen.add(`${n.front}\u0000${n.back}`))
  }
  let added = 0
  let duplicates = 0
  for (const c of cards) {
    const key = `${c.front}\u0000${c.back}`
    if (skipDuplicates && seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    await createNote({ deckId, type: c.type, front: c.front, back: c.back, tags: c.tags })
    added++
  }
  return { added, duplicates }
}
