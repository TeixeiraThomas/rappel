import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { clozeAnswers, clozeNumbers, renderCloze, stripCloze } from './cloze'
import { buildTree, createDeck, deleteDeck, descendantIds, getOrCreateDeckPath, moveDeck } from './decks'
import { createNote, deleteNote, normalizeTags, ordsForNote, updateNote, validateNote } from './notes'
import { cardFaces } from './render'
import { matchNote, parseQuery } from './search'

async function reset() {
  await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.kv.clear()])
}

describe('texte à trous', () => {
  const t = 'Le {{c1::TCP}} utilise un {{c2::handshake::3 étapes}} ; {{c1::SYN}} puis ACK.'
  it('détecte les numéros', () => expect(clozeNumbers(t)).toEqual([1, 2]))
  it('masque uniquement le trou actif au recto', () => {
    const r = renderCloze(t, 1, 'front')
    expect(r).toContain('<span class="cloze">[…]</span>')
    expect(r).toContain('handshake')
    expect(r).not.toContain('TCP')
  })
  it("affiche l'indice", () => expect(renderCloze(t, 2, 'front')).toContain('[3 étapes]'))
  it('met en évidence la réponse au verso', () => expect(renderCloze(t, 2, 'back')).toContain('cloze-reveal">handshake'))
  it('extrait les réponses', () => expect(clozeAnswers(t, 1)).toEqual(['TCP', 'SYN']))
  it('retire la syntaxe', () => expect(stripCloze(t)).toBe('Le TCP utilise un handshake ; SYN puis ACK.'))
})

describe('paquets', () => {
  beforeEach(reset)

  it('construit un arbre trié', async () => {
    const a = await createDeck('Réseau')
    await createDeck('Switching', a.id)
    await createDeck('Routage', a.id)
    await createDeck('Anglais')
    const tree = buildTree(await db.decks.toArray())
    expect(tree.map((n) => n.deck.name)).toEqual(['Anglais', 'Réseau'])
    expect(tree[1].children.map((n) => n.path)).toEqual(['Réseau::Routage', 'Réseau::Switching'])
  })

  it('refuse un cycle', async () => {
    const a = await createDeck('A')
    const b = await createDeck('B', a.id)
    await expect(moveDeck(a.id, b.id)).rejects.toThrow()
    await moveDeck(b.id, null)
    expect((await db.decks.get(b.id))?.parentId).toBeNull()
  })

  it('crée un chemin A::B::C sans doublon', async () => {
    const c1 = await getOrCreateDeckPath('Cisco::OSPF::Voisins')
    const c2 = await getOrCreateDeckPath('cisco::ospf::voisins')
    expect(c1.id).toBe(c2.id)
    expect(await db.decks.count()).toBe(3)
  })

  it('supprime en cascade', async () => {
    const a = await createDeck('A')
    const b = await createDeck('B', a.id)
    await createNote({ deckId: b.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    await deleteDeck(a.id)
    expect(await db.decks.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })

  it('liste les descendants', async () => {
    const a = await createDeck('A')
    const b = await createDeck('B', a.id)
    const c = await createDeck('C', b.id)
    expect(descendantIds(await db.decks.toArray(), a.id).sort()).toEqual([a.id, b.id, c.id].sort())
  })
})

describe('notes et cartes', () => {
  beforeEach(reset)

  it('normalise les tags', () => {
    expect(normalizeTags('#Réseau, vlan  CCNA;ccna')).toEqual(['réseau', 'vlan', 'ccna'])
  })

  it('génère les bonnes cartes selon le type', async () => {
    const d = await createDeck('D')
    await createNote({ deckId: d.id, type: 'basic', front: 'a', back: 'b', tags: [] })
    await createNote({ deckId: d.id, type: 'reversed', front: 'a', back: 'b', tags: [] })
    await createNote({ deckId: d.id, type: 'cloze', front: '{{c1::x}} {{c3::y}}', back: '', tags: [] })
    expect(await db.cards.count()).toBe(1 + 2 + 2)
    expect(ordsForNote('cloze', '{{c1::x}} {{c3::y}}')).toEqual([0, 2])
  })

  it('valide le contenu', () => {
    expect(validateNote('basic', '', 'x')).toBeTruthy()
    expect(validateNote('basic', 'x', '')).toBeTruthy()
    expect(validateNote('cloze', 'sans trou', '')).toBeTruthy()
    expect(validateNote('cloze', '{{c1::ok}}', '')).toBeNull()
  })

  it("resynchronise les cartes à l'édition", async () => {
    const d = await createDeck('D')
    const n = await createNote({ deckId: d.id, type: 'cloze', front: '{{c1::a}} {{c2::b}}', back: '', tags: [] })
    expect(await db.cards.count()).toBe(2)
    await updateNote(n.id, { front: '{{c1::a}}' })
    expect(await db.cards.count()).toBe(1)
    await updateNote(n.id, { type: 'basic', front: 'q', back: 'r' })
    expect(await db.cards.count()).toBe(1)
    await updateNote(n.id, { type: 'reversed' })
    expect(await db.cards.count()).toBe(2)
  })

  it('déplace les cartes avec la note', async () => {
    const a = await createDeck('A')
    const b = await createDeck('B')
    const n = await createNote({ deckId: a.id, type: 'reversed', front: 'q', back: 'r', tags: [] })
    await updateNote(n.id, { deckId: b.id })
    expect((await db.cards.toArray()).every((c) => c.deckId === b.id)).toBe(true)
  })

  it('supprime la note et ses cartes', async () => {
    const d = await createDeck('D')
    const n = await createNote({ deckId: d.id, type: 'reversed', front: 'q', back: 'r', tags: [] })
    await deleteNote(n.id)
    expect(await db.cards.count()).toBe(0)
  })

  it('produit recto/verso corrects pour la carte inverse et le cloze', () => {
    const base = { id: 'n', deckId: 'd', tags: [], created: 0, updated: 0 }
    const rev = cardFaces({ ...base, type: 'reversed', front: 'Q', back: 'R' }, 1)
    expect(rev.front).toBe('R')
    expect(rev.expected).toBe('Q')
    const cl = cardFaces({ ...base, type: 'cloze', front: 'Port {{c1::22}}', back: 'SSH' }, 0)
    expect(cl.expected).toBe('22')
    expect(cl.back).toContain('SSH')
  })
})

describe('recherche', () => {
  const note = {
    id: '1', deckId: 'd', type: 'basic' as const, front: 'Commande **show ip route**',
    back: 'Affiche la table de routage', tags: ['cisco', 'routage'], created: 0, updated: 0,
  }
  it('trouve par mots sans tenir compte des accents/casse', () => {
    expect(matchNote(note, parseQuery('ROUTAGE table'), 'Réseau')).toBe(true)
    expect(matchNote(note, parseQuery('vlan'), 'Réseau')).toBe(false)
  })
  it('filtre par tag, paquet et type', () => {
    expect(matchNote(note, parseQuery('tag:cisco'), 'Réseau')).toBe(true)
    expect(matchNote(note, parseQuery('tag:linux'), 'Réseau')).toBe(false)
    expect(matchNote(note, parseQuery('deck:reseau'), 'Réseau::OSPF')).toBe(true)
    expect(matchNote(note, parseQuery('type:cloze'), 'Réseau')).toBe(false)
  })
  it('gère les phrases entre guillemets', () => {
    expect(matchNote(note, parseQuery('"table de routage"'), 'R')).toBe(true)
    expect(matchNote(note, parseQuery('"routage de table"'), 'R')).toBe(false)
  })
})
