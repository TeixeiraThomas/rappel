// @vitest-environment jsdom
import DOMPurify from 'dompurify'
import { describe, expect, it } from 'vitest'
import { moduleNotes, moduleSize } from '../lib/library'
import { mdToHtml } from '../lib/markdown'
import { normalizeTags, validateNote } from '../lib/notes'
import { CATEGORIES, MODULES } from './catalog'

const SVG_RE = /<svg[\s\S]*?<\/svg>/g

describe('catalogue des modules', () => {
  it('identifiants, noms de paquets et catégories cohérents', () => {
    const ids = MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(MODULES.map((m) => m.deckName.toLowerCase())).size).toBe(MODULES.length)
    for (const m of MODULES) {
      expect(normalizeTags([m.id])).toEqual([m.id])
      expect(m.deckName).not.toContain('::')
      expect(CATEGORIES.map((c) => c.id)).toContain(m.category)
    }
  })
})

describe.each(MODULES)('module $id', (meta) => {
  it('chaque carte est valide et le recto est unique', async () => {
    const content = await meta.load()
    expect(content.chapters.length).toBeGreaterThan(0)
    const titles = content.chapters.map((c) => c.title)
    expect(new Set(titles).size, 'titres de chapitres en double').toBe(titles.length)
    for (const ch of content.chapters) {
      expect(ch.title, ch.title).not.toContain('::')
      expect(normalizeTags([ch.tag]), `tag de « ${ch.title} »`).toEqual([ch.tag])
      expect(ch.cards.length, `chapitre vide : ${ch.title}`).toBeGreaterThan(0)
    }
    const notes = moduleNotes(meta, content)
    const seen = new Set<string>()
    for (const n of notes) {
      expect(validateNote(n.type, n.front, n.back), n.front).toBeNull()
      expect(seen.has(n.front), `recto en double : ${n.front}`).toBe(false)
      seen.add(n.front)
    }
  })

  it('compteurs du catalogue exacts', async () => {
    expect(moduleSize(meta, await meta.load())).toEqual({ notes: meta.notes, cards: meta.cards })
  })

  it('chaque SVG est bien formé et survit à l’assainissement', async () => {
    for (const n of moduleNotes(meta, await meta.load())) {
      for (const svg of `${n.front}\n${n.back}`.match(SVG_RE) ?? []) {
        // Une ligne vide couperait le bloc HTML pour Markdown.
        expect(/\n\s*\n/.test(svg), `ligne vide dans un SVG : ${n.front.slice(0, 80)}`).toBe(false)
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
        expect(doc.getElementsByTagName('parsererror').length, `SVG invalide : ${n.back}`).toBe(0)
        const html = DOMPurify.sanitize(mdToHtml(n.front))
        expect(html).toContain('<svg')
      }
    }
  })
})
