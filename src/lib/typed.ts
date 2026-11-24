import type { Rating } from '../types'
import { fold } from './search'

export type Verdict = 'exact' | 'correct' | 'close' | 'wrong'

export interface Part {
  text: string
  /** same : identique ; extra : en trop dans la saisie ; missing : manquant dans la saisie. */
  kind: 'same' | 'extra' | 'missing'
}

export interface Comparison {
  verdict: Verdict
  /** 0..1 */
  similarity: number
  /** Saisie annotée (same + extra). */
  typedParts: Part[]
  /** Réponse attendue annotée (same + missing). */
  expectedParts: Part[]
  /** Note suggérée (non appliquée automatiquement). */
  suggested: Rating
}

/** Normalisation tolérante : casse, accents, espaces multiples, ponctuation finale. */
export function normalizeAnswer(s: string): string {
  return fold(s)
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Différence caractère par caractère (plus longue sous-séquence commune). */
function diff(a: string, b: string): { typedParts: Part[]; expectedParts: Part[] } {
  const n = a.length
  const m = b.length
  // Garde-fou : pas de diff détaillé pour de très longs textes.
  if (n * m > 4_000_000) {
    return { typedParts: [{ text: a, kind: 'same' }], expectedParts: [{ text: b, kind: 'same' }] }
  }
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const typedParts: Part[] = []
  const expectedParts: Part[] = []
  const push = (arr: Part[], kind: Part['kind'], ch: string) => {
    const last = arr[arr.length - 1]
    if (last && last.kind === kind) last.text += ch
    else arr.push({ text: ch, kind })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(typedParts, 'same', a[i])
      push(expectedParts, 'same', b[j])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push(typedParts, 'extra', a[i++])
    else push(expectedParts, 'missing', b[j++])
  }
  while (i < n) push(typedParts, 'extra', a[i++])
  while (j < m) push(expectedParts, 'missing', b[j++])
  return { typedParts, expectedParts }
}

/** Compare la saisie de l'utilisateur à la réponse attendue. */
export function compareAnswer(typed: string, expected: string): Comparison {
  const t = typed.trim()
  const e = expected.trim()
  const { typedParts, expectedParts } = diff(t, e)
  const nt = normalizeAnswer(t)
  const ne = normalizeAnswer(e)
  const maxLen = Math.max(nt.length, ne.length, 1)
  const similarity = 1 - levenshtein(nt, ne) / maxLen

  let verdict: Verdict
  if (t === e) verdict = 'exact'
  else if (nt === ne && ne.length > 0) verdict = 'correct'
  else if (ne.length >= 5 && similarity >= 0.8) verdict = 'close'
  else verdict = 'wrong'

  const suggested: Rating = verdict === 'exact' || verdict === 'correct' ? 3 : verdict === 'close' ? 2 : 1
  return { verdict, similarity, typedParts, expectedParts, suggested }
}
