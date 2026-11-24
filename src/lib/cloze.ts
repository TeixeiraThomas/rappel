// Texte à trous au format Anki : {{c1::réponse}} ou {{c1::réponse::indice}}

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g

/** Numéros de trous présents dans le texte, triés et sans doublon. */
export function clozeNumbers(text: string): number[] {
  const set = new Set<number>()
  for (const m of text.matchAll(CLOZE_RE)) set.add(Number(m[1]))
  return [...set].sort((a, b) => a - b)
}

/**
 * Remplace les trous par du HTML prêt à passer dans le Markdown.
 * - face « front » : le trou actif est masqué ([…] ou [indice]), les autres sont affichés ;
 * - face « back »  : le trou actif est mis en évidence.
 */
export function renderCloze(text: string, active: number, side: 'front' | 'back'): string {
  return text.replace(CLOZE_RE, (_all, n: string, answer: string, hint?: string) => {
    if (Number(n) !== active) return answer
    if (side === 'front') return `<span class="cloze">[${hint ? escapeHtml(hint) : '…'}]</span>`
    return `<span class="cloze-reveal">${answer}</span>`
  })
}

/** Réponses attendues du trou n (utile pour le mode « taper la réponse »). */
export function clozeAnswers(text: string, n: number): string[] {
  const out: string[] = []
  for (const m of text.matchAll(CLOZE_RE)) if (Number(m[1]) === n) out.push(m[2])
  return out
}

/** Retire la syntaxe des trous (pour les aperçus et la recherche). */
export function stripCloze(text: string): string {
  return text.replace(CLOZE_RE, (_a, _n, answer: string) => answer)
}

export function hasCloze(text: string): boolean {
  return /\{\{c\d+::/.test(text)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
