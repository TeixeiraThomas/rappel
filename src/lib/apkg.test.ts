import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { ankiHtmlToMd, importApkg } from './apkg'

async function reset() {
  await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.media.clear(), db.kv.clear()])
}

/** Fabrique un .apkg minimal (format anki2) pour les tests. */
async function makeApkg() {
  const SQL = await initSqlJs()
  const d = new SQL.Database()
  d.run('CREATE TABLE col (models TEXT, decks TEXT)')
  d.run('CREATE TABLE notes (id INTEGER, mid INTEGER, flds TEXT, tags TEXT)')
  d.run('CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, ord INTEGER)')
  const models = {
    1: { name: 'Basique', type: 0, tmpls: [{}] },
    2: { name: 'Basique (et inversé)', type: 0, tmpls: [{}, {}] },
    3: { name: 'Texte à trous', type: 1, tmpls: [{}] },
  }
  const decks = { 10: { name: 'Réseau::OSPF' }, 1: { name: 'Default' } }
  d.run('INSERT INTO col VALUES (?, ?)', [JSON.stringify(models), JSON.stringify(decks)])
  const f = (...a: string[]) => a.join('\x1f')
  d.run('INSERT INTO notes VALUES (1, 1, ?, ?)', [f('Quelle <b>commande</b> ?<br>Vite', '<code>show ip ospf</code>&nbsp;neighbor'), ' cisco ospf '])
  d.run('INSERT INTO notes VALUES (2, 2, ?, ?)', [f('chat', 'cat'), ''])
  d.run('INSERT INTO notes VALUES (3, 3, ?, ?)', [f('Port {{c1::22}} = {{c2::SSH}}', 'Extra'), ''])
  d.run('INSERT INTO notes VALUES (4, 1, ?, ?)', [f('Image <img src="schema.png">', 'ok'), ''])
  d.run('INSERT INTO cards VALUES (1, 1, 10, 0)')
  d.run('INSERT INTO cards VALUES (2, 2, 10, 0)')
  d.run('INSERT INTO cards VALUES (3, 2, 10, 1)')
  d.run('INSERT INTO cards VALUES (4, 3, 1, 0)')
  d.run('INSERT INTO cards VALUES (5, 3, 1, 1)')
  d.run('INSERT INTO cards VALUES (6, 4, 1, 0)')
  const bytes = d.export()
  d.close()
  const zip = new JSZip()
  zip.file('collection.anki2', bytes)
  zip.file('media', JSON.stringify({ 0: 'schema.png', 1: 'son.mp3' }))
  zip.file('0', new Uint8Array([137, 80, 78, 71]))
  zip.file('1', new Uint8Array([1, 2, 3]))
  return { SQL, data: await zip.generateAsync({ type: 'uint8array' }) }
}

describe('import .apkg', () => {
  beforeEach(reset)

  it('convertit le HTML Anki en Markdown', () => {
    const ids = new Map([['a.png', 'M1']])
    expect(ankiHtmlToMd('<div>un <b>gras</b></div><div>deux<br>trois</div>', ids)).toBe('un **gras**\ndeux\ntrois')
    expect(ankiHtmlToMd('<img src="a.png"> [sound:x.mp3]', ids)).toBe('![](media:M1)')
    expect(ankiHtmlToMd('<img src="inconnue.png">', ids)).toBe('')
  })

  it('importe paquets, types de notes, tags et images', async () => {
    const { SQL, data } = await makeApkg()
    const res = await importApkg(data, SQL, 'Mon import')
    expect(res).toMatchObject({ notes: 4, cards: 1 + 2 + 2 + 1, images: 1, skipped: 0 })

    const decks = await db.decks.toArray()
    expect(decks.map((d) => d.name).sort()).toEqual(['Mon import', 'OSPF', 'Réseau'])

    const notes = await db.notes.toArray()
    const basic = notes.find((n) => n.front.startsWith('Quelle'))!
    expect(basic.type).toBe('basic')
    expect(basic.front).toBe('Quelle **commande** ?\nVite')
    expect(basic.back).toBe('`show ip ospf` neighbor')
    expect(basic.tags).toEqual(['cisco', 'ospf'])
    expect(notes.find((n) => n.front === 'chat')!.type).toBe('reversed')
    expect(notes.find((n) => n.type === 'cloze')!.back).toBe('Extra')
    expect(notes.find((n) => n.front.startsWith('Image'))!.front).toMatch(/!\[\]\(media:[a-f0-9]+\)/)
    expect(await db.media.count()).toBe(1)
  })

  it('refuse un fichier sans base de données', async () => {
    const { SQL } = await makeApkg()
    const zip = new JSZip()
    zip.file('collection.anki21b', new Uint8Array([1]))
    await expect(importApkg(await zip.generateAsync({ type: 'uint8array' }), SQL)).rejects.toThrow(/anciennes versions/)
  })
})
