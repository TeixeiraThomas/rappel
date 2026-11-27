import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import type { ModuleContent } from '../modules/types'
import { buildTree, flattenTree, renameDeck } from './decks'
import { chaptersProgress, installedCount, installModule, moduleNotes, moduleRootDeck, modulesProgress, moduleSize, removeModule } from './library'
import { createDeck } from './decks'
import { makeNote, updateNote } from './notes'

async function reset() {
  await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.kv.clear()])
}

const meta = { id: 'test-mod', deckName: 'Module de test' }
const content: ModuleContent = {
  chapters: [
    {
      title: 'Bases',
      tag: 'bases',
      cards: [
        ['Question A ?', 'Réponse A'],
        ['Le protocole {{c1::TCP}} est fiable, {{c2::UDP}} non.'],
      ],
    },
    { title: 'Avancé', tag: 'avance', cards: [['Question B ?', 'Réponse B']] },
  ],
}

const paths = async () => flattenTree(buildTree(await db.decks.toArray())).map((n) => n.path)

describe('modules : ajout et mise à jour', () => {
  beforeEach(reset)

  it('décrit les notes dans l’ordre du programme', () => {
    const notes = moduleNotes(meta, content)
    expect(notes.map((n) => n.deckPath)).toEqual([
      'Module de test::1. Bases',
      'Module de test::1. Bases',
      'Module de test::2. Avancé',
    ])
    expect(notes[1].type).toBe('cloze')
    expect(notes[0].tags).toEqual(['test-mod', 'bases'])
    expect(moduleSize(meta, content)).toEqual({ notes: 3, cards: 4 })
  })

  it('crée l’arbre de paquets, les notes taguées et les cartes dans l’ordre', async () => {
    const r = await installModule(meta, content)
    expect(r.added).toBe(3)
    expect(await paths()).toEqual(['Module de test', 'Module de test::1. Bases', 'Module de test::2. Avancé'])
    expect(await installedCount('test-mod')).toBe(3)
    const root = await db.decks.get(r.rootDeckId)
    expect(root?.name).toBe('Module de test')
    // Les nouvelles cartes sortent par échéance croissante : l'ordre doit suivre le programme.
    const cards = (await db.cards.toArray()).sort((a, b) => a.due - b.due || a.ord - b.ord)
    const notes = new Map((await db.notes.toArray()).map((n) => [n.id, n]))
    expect(cards.map((c) => notes.get(c.noteId)!.front)).toEqual([
      'Question A ?',
      'Le protocole {{c1::TCP}} est fiable, {{c2::UDP}} non.',
      'Le protocole {{c1::TCP}} est fiable, {{c2::UDP}} non.',
      'Question B ?',
    ])
  })

  it('réajout sans doublon', async () => {
    await installModule(meta, content)
    const again = await installModule(meta, content)
    expect(again).toMatchObject({ added: 0, updated: 0 })
    expect(await db.notes.count()).toBe(3)
    expect(await db.cards.count()).toBe(4)
    expect(await db.decks.count()).toBe(3)
  })

  it('ajoute les cartes nouvelles et corrige le verso des notes non modifiées', async () => {
    await installModule(meta, content)
    const v2: ModuleContent = {
      chapters: [
        { ...content.chapters[0], cards: [['Question A ?', 'Réponse A corrigée'], content.chapters[0].cards[1]] },
        { ...content.chapters[1], cards: [...content.chapters[1].cards, ['Question C ?', 'Réponse C']] },
      ],
    }
    const r = await installModule(meta, v2)
    expect(r).toMatchObject({ added: 1, updated: 1 })
    const a = await db.notes.filter((n) => n.front === 'Question A ?').first()
    expect(a?.back).toBe('Réponse A corrigée')
    expect(a?.updated).toBe(a?.created) // toujours « non modifiée » : recevra les corrections suivantes
    const c = await db.notes.filter((n) => n.front === 'Question C ?').first()
    expect((await db.decks.get(c!.deckId))?.name).toBe('2. Avancé')
  })

  it('respecte les notes modifiées par l’utilisateur', async () => {
    await installModule(meta, content)
    const a = (await db.notes.filter((n) => n.front === 'Question A ?').first())!
    await new Promise((r) => setTimeout(r, 2))
    await updateNote(a.id, { back: 'Ma propre réponse' })
    const v2: ModuleContent = {
      chapters: [{ ...content.chapters[0], cards: [['Question A ?', 'Réponse A corrigée']] }, content.chapters[1]],
    }
    const r = await installModule(meta, v2)
    expect(r.updated).toBe(0)
    expect((await db.notes.get(a.id))?.back).toBe('Ma propre réponse')
  })

  it('mise à jour après renommage : retrouve le paquet renommé, ne supprime rien', async () => {
    const first = await installModule(meta, content)
    await renameDeck(first.rootDeckId, 'Mon module')
    expect(await moduleRootDeck(meta)).toBe(first.rootDeckId)
    const v2: ModuleContent = { chapters: [...content.chapters, { title: 'Nouveau', tag: 'nouveau', cards: [['Question D ?', 'D']] }] }
    const r = await installModule(meta, v2)
    expect(r.added).toBe(1)
    expect(await db.notes.count()).toBe(4)
    // La carte manquante est créée sous le chemin d'origine, le paquet renommé est conservé tel quel.
    expect(await paths()).toContain('Module de test::3. Nouveau')
    expect(await paths()).toContain('Mon module::1. Bases')
  })
})

describe('modules : chapitres, avancement et retrait', () => {
  beforeEach(reset)

  it('ajoute un seul chapitre, puis complète sans doublon et dans l’ordre du programme', async () => {
    const r = await installModule(meta, content, { chapters: [1] })
    expect(r.added).toBe(1)
    expect(await paths()).toEqual(['Module de test', 'Module de test::2. Avancé'])
    const rest = await installModule(meta, content)
    expect(rest.added).toBe(2)
    expect(await db.notes.count()).toBe(3)
    expect(await paths()).toEqual(['Module de test', 'Module de test::1. Bases', 'Module de test::2. Avancé'])
  })

  it('mesure l’avancement du module et de chaque chapitre', async () => {
    expect((await modulesProgress(['test-mod'])).has('test-mod')).toBe(false)
    await installModule(meta, content, { chapters: [0] })
    const now = Date.now()
    // Une carte vue et acquise (intervalle de 30 j, échéance passée : à revoir), une carte vue récemment.
    const cards = await db.cards.toArray()
    await db.cards.update(cards[0].id, { state: 2, scheduledDays: 30, due: now - 1000 })
    await db.cards.update(cards[1].id, { state: 1, scheduledDays: 0, due: now + 3 * 86_400_000 })
    const p = (await modulesProgress(['test-mod'], now)).get('test-mod')!
    expect(p).toEqual({ notes: 2, cards: 3, seen: 2, mastered: 1, due: 1 })

    const ch = await chaptersProgress(meta, content, now)
    expect(ch.map((c) => [c.total, c.notes, c.cards])).toEqual([
      [2, 2, 3],
      [1, 0, 0],
    ])
    expect(ch[0].deckId).not.toBeNull()
    expect(ch[1].deckId).toBeNull()
    expect((await db.decks.get(ch[0].deckId!))?.name).toBe('1. Bases')
  })

  it('retire un module et ses paquets vides, garde les cartes personnelles et les autres paquets', async () => {
    const r = await installModule(meta, content)
    const other = await createDeck('Autre paquet')
    await db.transaction('rw', db.decks, db.notes, db.cards, async () => {
      const own = makeNote({ deckId: other.id, type: 'basic', front: 'Perso', back: 'x', tags: [] })
      await db.notes.add(own.note)
      await db.cards.bulkAdd(own.cards)
      // Une carte personnelle rangée dans un chapitre du module : ce sous-paquet doit survivre.
      const bases = (await db.decks.filter((d) => d.name === '1. Bases').first())!
      const mine = makeNote({ deckId: bases.id, type: 'basic', front: 'Ma note', back: 'y', tags: [] })
      await db.notes.add(mine.note)
      await db.cards.bulkAdd(mine.cards)
    })
    const out = await removeModule(meta)
    expect(out).toEqual({ notes: 3, decks: 1 })
    expect(await installedCount('test-mod')).toBe(0)
    expect(await db.notes.count()).toBe(2)
    expect(await db.cards.count()).toBe(2)
    expect(await paths()).toEqual(['Autre paquet', 'Module de test', 'Module de test::1. Bases'])
    expect(await db.decks.get(r.rootDeckId)).toBeDefined()
  })

  it('retrait complet : plus aucun paquet du module', async () => {
    await installModule(meta, content)
    expect(await removeModule(meta)).toEqual({ notes: 3, decks: 3 })
    expect(await db.decks.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await removeModule(meta)).toEqual({ notes: 0, decks: 0 })
  })
})
