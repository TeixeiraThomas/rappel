import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { autoBackup, autoDb, getAutoBackup, listAutoBackups, MAX_AUTO_BACKUPS, restoreBackupSafely } from './autobackup'
import { backupReminderDue, exportBackup, getBackupStatus, markBackupDone, snoozeBackupReminder } from './backup'
import { csvToCards, importCards, parseCsv } from './csv'
import { createDeck } from './decks'
import { createNote } from './notes'
import { formatBytes } from './storage'

async function reset() {
  await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.media.clear(), db.kv.clear(), autoDb.snapshots.clear()])
}

describe('sauvegardes automatiques', () => {
  beforeEach(reset)

  it('ne fait rien sur une collection vide', async () => {
    expect(await autoBackup('test')).toBe(true)
    expect(await autoDb.snapshots.count()).toBe(0)
  })

  it('prend un instantané lisible et complet', async () => {
    const d = await createDeck('A')
    await createNote({ deckId: d.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    await autoBackup('Avant test')
    const [s] = await listAutoBackups()
    expect(s).toMatchObject({ reason: 'Avant test', notes: 1, cards: 1 })
    const data = await getAutoBackup(s.id)
    expect(data?.notes).toHaveLength(1)
  })

  it('ne garde que les plus récentes', async () => {
    const d = await createDeck('A')
    await createNote({ deckId: d.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    for (let i = 0; i < MAX_AUTO_BACKUPS + 3; i++) await autoBackup(`n°${i}`)
    const list = await listAutoBackups()
    expect(list).toHaveLength(MAX_AUTO_BACKUPS)
    expect(list[0].reason).toBe(`n°${MAX_AUTO_BACKUPS + 2}`)
  })

  it("un import CSV prend d'abord un instantané de l'existant", async () => {
    const d = await createDeck('A')
    await createNote({ deckId: d.id, type: 'basic', front: 'existant', back: 'x', tags: [] })
    const res = await importCards(csvToCards(parseCsv('Q;R')).cards, d.id)
    expect(res).toMatchObject({ added: 1, safetyBackup: true })
    const [s] = await listAutoBackups()
    expect(s.reason).toBe('Avant import CSV')
    expect(s.notes).toBe(1) // état AVANT l'import
  })

  it('une restauration est annulable via l’instantané pris avant', async () => {
    const d = await createDeck('Avant')
    await createNote({ deckId: d.id, type: 'basic', front: 'garde-moi', back: 'x', tags: [] })
    const original = JSON.parse(JSON.stringify(await exportBackup()))

    // Une autre collection vient remplacer la première.
    await reset()
    const d2 = await createDeck('Autre')
    await createNote({ deckId: d2.id, type: 'basic', front: 'autre', back: 'y', tags: [] })
    const other = JSON.parse(JSON.stringify(await exportBackup()))
    await restoreBackupSafely(original, 'replace')
    expect((await db.notes.toArray()).map((n) => n.front)).toEqual(['garde-moi'])

    // L'instantané contient la collection « Autre » : on peut revenir en arrière.
    const [snap] = await listAutoBackups()
    expect(snap.reason).toMatch(/restauration/)
    const back = await getAutoBackup(snap.id)
    expect(back?.notes.map((n) => n.front)).toEqual(['autre'])
    expect(other.notes).toHaveLength(1)
    await restoreBackupSafely(back!, 'replace')
    expect((await db.notes.toArray()).map((n) => n.front)).toEqual(['autre'])
  })
})

describe('rappel de sauvegarde', () => {
  const DAY = 86_400_000
  const base = { now: 100 * DAY, lastBackup: null, snoozeUntil: null, firstNoteAt: null, noteCount: 5, intervalDays: 7 }

  it('pas de rappel sans données ou si désactivé', () => {
    expect(backupReminderDue({ ...base, firstNoteAt: 0, noteCount: 0 })).toBe(false)
    expect(backupReminderDue({ ...base, firstNoteAt: 0, intervalDays: 0 })).toBe(false)
  })
  it('rappel si jamais sauvegardé et premières cartes anciennes', () => {
    expect(backupReminderDue({ ...base, firstNoteAt: 100 * DAY - 8 * DAY })).toBe(true)
    expect(backupReminderDue({ ...base, firstNoteAt: 100 * DAY - 2 * DAY })).toBe(false)
  })
  it('se base sur la dernière sauvegarde', () => {
    expect(backupReminderDue({ ...base, lastBackup: 100 * DAY - 3 * DAY, firstNoteAt: 0 })).toBe(false)
    expect(backupReminderDue({ ...base, lastBackup: 100 * DAY - 7 * DAY, firstNoteAt: 0 })).toBe(true)
  })
  it('respecte le report « Plus tard »', () => {
    expect(backupReminderDue({ ...base, firstNoteAt: 0, snoozeUntil: 100 * DAY + 1 })).toBe(false)
    expect(backupReminderDue({ ...base, firstNoteAt: 0, snoozeUntil: 100 * DAY - 1 })).toBe(true)
  })

  beforeEach(reset)
  it('mémorise sauvegarde et report en base', async () => {
    const d = await createDeck('A')
    await createNote({ deckId: d.id, type: 'basic', front: 'q', back: 'r', tags: [] })
    await snoozeBackupReminder(3, 1000)
    expect((await getBackupStatus()).snoozeUntil).toBe(1000 + 3 * DAY)
    await markBackupDone(5000)
    const s = await getBackupStatus()
    expect(s.lastBackup).toBe(5000)
    expect(s.snoozeUntil).toBeNull()
    expect(s.noteCount).toBe(1)
  })
})

describe('formatage', () => {
  it('formate les tailles', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(512)).toBe('512 o')
    expect(formatBytes(1536)).toBe('1,5 Ko')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 Mo')
  })
})
