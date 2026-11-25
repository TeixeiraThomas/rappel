import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RappelDB } from '../db'
import { hasLocalChanges, runSync, type OutgoingDoc, type Remote, type RemoteDoc } from './sync'
import type { SyncedTable } from './syncTracking'

/** Serveur en mémoire qui imite Firestore : horodatage serveur croissant, documents par table. */
class MemoryRemote implements Remote {
  docs = new Map<string, RemoteDoc>()
  clock = 1000
  writes = 0
  async pull(t: SyncedTable, sinceS: number): Promise<RemoteDoc[]> {
    return [...this.docs.values()].filter((d) => d.t === t && d.s > sinceS).map((d) => structuredClone(d))
  }
  async push(docs: OutgoingDoc[]): Promise<void> {
    const s = ++this.clock // un lot = une écriture serveur (même horodatage, comme un batch Firestore)
    for (const d of docs) {
      this.docs.set(`${d.t}/${d.id}`, structuredClone({ ...d, s }))
      this.writes++
    }
  }
}

const deck = (id: string, name: string) => ({ id, name, parentId: null, created: 1 })
const note = (id: string, deckId: string, front: string) => ({
  id, deckId, type: 'basic' as const, front, back: 'verso', tags: [], created: 1, updated: 1,
})
const card = (id: string, noteId: string, deckId: string) => ({
  id, noteId, deckId, ord: 0, due: 1, stability: 0, difficulty: 0, scheduledDays: 0,
  learningSteps: 0, reps: 0, lapses: 0, state: 0 as const, lastReview: null,
})
const tick = () => new Promise((r) => setTimeout(r, 2))

let a: RappelDB
let b: RappelDB
let remote: MemoryRemote
let n = 0

beforeEach(async () => {
  n++
  a = new RappelDB(`sync-a-${n}`)
  b = new RappelDB(`sync-b-${n}`)
  remote = new MemoryRemote()
  await a.open()
  await b.open()
})

afterEach(async () => {
  await a.delete()
  await b.delete()
})

describe('synchronisation entre deux appareils', () => {
  it('les cartes créées sur le PC arrivent sur le téléphone', async () => {
    await a.decks.add(deck('d1', 'CCNA'))
    await a.notes.add(note('n1', 'd1', 'OSI'))
    await a.cards.add(card('c1', 'n1', 'd1'))
    const ra = await runSync(a, remote, 'u1')
    expect(ra.sent).toBe(3)
    const rb = await runSync(b, remote, 'u1')
    expect(rb.received).toBe(3)
    expect((await b.notes.get('n1'))?.front).toBe('OSI')
    expect(await b.cards.count()).toBe(1)
  })

  it('une modification sur le téléphone revient sur le PC', async () => {
    await a.notes.add(note('n1', 'd1', 'avant'))
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    await tick()
    await b.notes.update('n1', { front: 'après' })
    await runSync(b, remote, 'u1')
    await runSync(a, remote, 'u1')
    expect((await a.notes.get('n1'))?.front).toBe('après')
  })

  it('une suppression est propagée', async () => {
    await a.notes.bulkAdd([note('n1', 'd1', 'garder'), note('n2', 'd1', 'supprimer')])
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    await a.notes.delete('n2')
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    expect(await b.notes.get('n2')).toBeUndefined()
    expect(await b.notes.get('n1')).toBeDefined()
    expect(await a.tombstones.count()).toBe(0) // pierre tombale envoyée puis effacée
  })

  it('en cas de conflit, la modification la plus récente gagne', async () => {
    await a.notes.add(note('n1', 'd1', 'origine'))
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    await tick()
    await a.notes.update('n1', { front: 'PC' })
    await tick()
    await b.notes.update('n1', { front: 'téléphone' }) // plus récente
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    await runSync(a, remote, 'u1')
    expect((await a.notes.get('n1'))?.front).toBe('téléphone')
    expect((await b.notes.get('n1'))?.front).toBe('téléphone')
  })

  it('pas d’écho : une fois synchronisés, plus rien n’est renvoyé', async () => {
    await a.notes.add(note('n1', 'd1', 'x'))
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    const before = remote.writes
    const ra = await runSync(a, remote, 'u1')
    const rb = await runSync(b, remote, 'u1')
    expect(ra.sent + rb.sent).toBe(0)
    expect(remote.writes).toBe(before)
    expect(await hasLocalChanges(a)).toBe(false)
    expect(await hasLocalChanges(b)).toBe(false)
  })

  it('les réglages voyagent, pas l’état propre à l’appareil', async () => {
    await a.kv.put({ key: 'settings', value: { newPerDay: 10 } })
    await a.kv.put({ key: 'lastBackup', value: 123 })
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    expect((await b.kv.get('settings'))?.value).toEqual({ newPerDay: 10 })
    expect(await b.kv.get('lastBackup')).toBeUndefined()
    expect([...remote.docs.keys()].filter((k) => k.startsWith('kv/'))).toEqual(['kv/settings'])
  })

  it('les données reçues ne repartent pas en pierres tombales ni en envois', async () => {
    await a.notes.add(note('n1', 'd1', 'x'))
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    await b.waitTombstones()
    expect(await b.tombstones.count()).toBe(0)
    expect(await hasLocalChanges(b)).toBe(false)
  })

  it('les données existantes avant la synchro sont envoyées à la première connexion', async () => {
    // Enregistrement créé « avant » la fonction de synchro : sans _u
    await a.transaction('rw', a.notes, async (tx) => {
      ;(tx as unknown as Record<string, boolean>).__rappelRemote = true
      await a.notes.add(note('ancien', 'd1', 'déjà là'))
    })
    expect(await hasLocalChanges(a)).toBe(true)
    await runSync(a, remote, 'u1')
    await runSync(b, remote, 'u1')
    expect((await b.notes.get('ancien'))?.front).toBe('déjà là')
  })

  it('changer de compte repart de zéro', async () => {
    await a.notes.add(note('n1', 'd1', 'x'))
    await runSync(a, remote, 'u1')
    const other = new MemoryRemote()
    const r = await runSync(b, other, 'u2')
    expect(r.received).toBe(0)
    expect(await b.notes.count()).toBe(0)
  })

  it('les champs de synchro locaux ne partent pas sur le serveur', async () => {
    await a.notes.add(note('n1', 'd1', 'x'))
    await runSync(a, remote, 'u1')
    const doc = remote.docs.get('notes/n1')
    expect(doc?.data).not.toHaveProperty('_u')
    expect(doc?.data).not.toHaveProperty('_p')
    expect(doc?.u).toBeGreaterThan(0)
  })
})
