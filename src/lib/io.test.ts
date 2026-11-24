import { beforeEach, describe, expect, it } from 'vitest'
import { db, saveSettings } from '../db'
import { exportBackup, restoreBackup, validateBackup } from './backup'
import { csvToCards, detectDelimiter, importCards, parseCsv } from './csv'
import { createDeck } from './decks'
import { createNote } from './notes'

async function reset() {
  await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.media.clear(), db.kv.clear()])
}

describe('CSV', () => {
  it('lit recto;verso;tags', () => {
    const rows = parseCsv('recto;verso;tags\nQ1;R1;a b\nQ2;R2;')
    expect(rows).toEqual([['recto', 'verso', 'tags'], ['Q1', 'R1', 'a b'], ['Q2', 'R2', '']])
    const p = csvToCards(rows)
    expect(p.hadHeader).toBe(true)
    expect(p.cards).toHaveLength(2)
    expect(p.cards[0].tags).toEqual(['a', 'b'])
  })

  it('gère guillemets, point-virgule et retours à la ligne dans un champ, CRLF, BOM', () => {
    const csv = '﻿"Q;1";"ligne1\nligne ""2""";x\r\nQ2;R2;\r\n'
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual(['Q;1', 'ligne1\nligne "2"', 'x'])
    expect(rows[1]).toEqual(['Q2', 'R2', ''])
  })

  it('détecte le séparateur', () => {
    expect(detectDelimiter('a;b;c')).toBe(';')
    expect(detectDelimiter('a,b,c')).toBe(',')
    expect(detectDelimiter('a\tb')).toBe('\t')
    expect(detectDelimiter('seul')).toBe(';')
  })

  it('signale les lignes invalides et reconnaît les trous', () => {
    const p = csvToCards(parseCsv('Q1;R1\nseulement recto\nLe {{c1::TCP}} est fiable;;cours'))
    expect(p.cards).toHaveLength(2)
    expect(p.cards[1].type).toBe('cloze')
    expect(p.invalid).toEqual([2])
  })

  it('importe sans doublons', async () => {
    await reset()
    const d = await createDeck('D')
    const cards = csvToCards(parseCsv('Q1;R1\nQ1;R1\nQ2;R2')).cards
    expect(await importCards(cards, d.id)).toMatchObject({ added: 2, duplicates: 1 })
    expect(await importCards(cards, d.id)).toMatchObject({ added: 0, duplicates: 3 })
    expect(await db.cards.count()).toBe(2)
  })
})

describe('sauvegarde JSON', () => {
  beforeEach(reset)

  it('exporte puis restaure à l’identique (aller-retour)', async () => {
    const d = await createDeck('Réseau')
    await createNote({ deckId: d.id, type: 'reversed', front: 'q', back: 'r', tags: ['t'] })
    await db.media.put({ id: 'm1', name: 'a.png', mime: 'image/png', data: 'data:image/png;base64,AAAA' })
    await saveSettings({ newPerDay: 7 })
    const json = JSON.parse(JSON.stringify(await exportBackup()))
    expect(validateBackup(json)).toBeNull()

    await reset()
    expect(await db.notes.count()).toBe(0)
    const res = await restoreBackup(json, 'replace')
    expect(res).toMatchObject({ decks: 1, notes: 1, cards: 2 })
    expect(await db.media.count()).toBe(1)
    expect((await db.kv.get('settings'))?.value).toMatchObject({ newPerDay: 7 })
  })

  it('fusionne sans supprimer l’existant', async () => {
    const d = await createDeck('A')
    await createNote({ deckId: d.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    const snap = JSON.parse(JSON.stringify(await exportBackup()))
    const d2 = await createDeck('B')
    await createNote({ deckId: d2.id, type: 'basic', front: 'q2', back: 'r2', tags: [] })
    await restoreBackup(snap, 'merge')
    expect(await db.decks.count()).toBe(2)
    expect(await db.notes.count()).toBe(2)
  })

  it('rejette les fichiers invalides', () => {
    expect(validateBackup(null)).toBeTruthy()
    expect(validateBackup({ format: 'autre' })).toBeTruthy()
    expect(validateBackup({ format: 'rappel-backup', version: 99, decks: [], notes: [], cards: [], reviews: [], media: [] })).toBeTruthy()
    expect(validateBackup({ format: 'rappel-backup', version: 1, decks: [], notes: [], cards: [{ noteId: 'x' }], reviews: [], media: [] })).toBeTruthy()
  })
})
