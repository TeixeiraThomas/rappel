import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

/** Markdown → HTML brut (À ASSAINIR avant insertion dans le DOM, voir components/Markdown). */
export function mdToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string
}

/**
 * Markdown/HTML → texte brut, utilisé pour la réponse attendue du mode « taper la réponse »
 * et pour les aperçus de liste. Les blocs de code gardent leur contenu (sans les ```).
 */
export function mdToPlain(md: string): string {
  return md
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

/** Aperçu court sur une ligne (listes de cartes). */
export function preview(md: string, max = 90): string {
  const flat = mdToPlain(md).replace(/\s+/g, ' ')
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

/** Identifiants de médias référencés dans le Markdown (« media:ID »). */
export function mediaIds(md: string): string[] {
  return [...new Set([...md.matchAll(/media:([A-Za-z0-9_-]+)/g)].map((m) => m[1]))]
}
