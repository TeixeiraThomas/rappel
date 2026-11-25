import type { RappelDB } from '../db'
import { isTracked, markRemote, SYNCED_TABLES, type SyncedTable, type Tombstone } from './syncTracking'

/**
 * Moteur de synchronisation entre appareils, indépendant du service distant.
 *
 * Principe (« la dernière modification gagne », enregistrement par enregistrement) :
 * 1. Réception : on récupère les documents modifiés sur le serveur depuis la dernière synchro
 *    (curseur `s` = horodatage serveur) et on applique ceux qui sont plus récents que la copie locale.
 * 2. Envoi : on envoie les enregistrements locaux modifiés depuis leur dernier envoi
 *    (`_u` = date de modification > `_p` = version déjà envoyée) et les suppressions.
 */

/** Document tel que stocké sur le serveur. */
export interface RemoteDoc {
  t: SyncedTable
  id: string
  /** Contenu de l'enregistrement, ou null s'il a été supprimé. */
  data: Record<string, unknown> | null
  /** Date de la modification sur l'appareil d'origine (ms). */
  u: number
  /** Horodatage serveur de l'écriture (ms), utilisé comme curseur de réception. */
  s: number
}

export type OutgoingDoc = Omit<RemoteDoc, 's'>

/** Ce que le moteur attend du service distant (Firestore en production, mémoire en test). */
export interface Remote {
  /** Documents de la table écrits sur le serveur strictement après `sinceS`. */
  pull(t: SyncedTable, sinceS: number): Promise<RemoteDoc[]>
  /** Écrit les documents (le serveur leur attribue `s`). */
  push(docs: OutgoingDoc[]): Promise<void>
}

export interface SyncState {
  uid: string
  /** Curseur de réception par table. */
  lastPullS: Partial<Record<SyncedTable, number>>
  /** Date de la dernière synchro réussie (ms). */
  lastSync: number | null
}

export interface SyncResult {
  sent: number
  received: number
  /** Images trop lourdes pour le serveur (non envoyées). */
  skipped: number
}

/** Taille maximale d'un document Firestore : 1 Mio. On garde une marge. */
export const MAX_DOC_BYTES = 900_000

const STATE_KEY = 'sync:state'

type Row = Record<string, unknown> & { _u?: number; _p?: number }

function primaryKey(t: SyncedTable, row: Row): string {
  return String(t === 'kv' ? row.key : row.id)
}

/** Copie « propre » pour le serveur : sans les champs locaux de synchro ni les valeurs undefined. */
export function toRemoteData(row: Row): Record<string, unknown> {
  const { _u, _p, ...rest } = row
  void _u
  void _p
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>
}

export async function getSyncState(db: RappelDB): Promise<SyncState | null> {
  const row = await db.kv.get(STATE_KEY)
  return (row?.value as SyncState | undefined) ?? null
}

async function saveSyncState(db: RappelDB, state: SyncState): Promise<void> {
  await db.kv.put({ key: STATE_KEY, value: state })
}

/** Oublie l'état de synchro (déconnexion) : la prochaine connexion refera une synchro complète. */
export async function resetSyncState(db: RappelDB): Promise<void> {
  await db.kv.delete(STATE_KEY)
}

/** Vrai s'il reste des modifications locales à envoyer. */
export async function hasLocalChanges(db: RappelDB): Promise<boolean> {
  await db.waitTombstones()
  if ((await db.tombstones.count()) > 0) return true
  for (const t of SYNCED_TABLES) {
    const dirty = await db
      .table(t)
      .filter((r: Row) => isTracked(t, r) && (r._u ?? 1) > (r._p ?? 0))
      .first()
    if (dirty) return true
  }
  return false
}

/** Lance une synchronisation complète (réception puis envoi). */
export async function runSync(db: RappelDB, remote: Remote, uid: string): Promise<SyncResult> {
  const prev = await getSyncState(db)
  // Changement de compte sur cet appareil : on repart de zéro.
  const state: SyncState = prev && prev.uid === uid ? prev : { uid, lastPullS: {}, lastSync: null }

  // ---------- 1. Réception ----------
  let received = 0
  await db.waitTombstones()
  for (const t of SYNCED_TABLES) {
    const docs = await remote.pull(t, state.lastPullS[t] ?? 0)
    if (docs.length === 0) continue
    const table = db.table(t)
    await db.transaction('rw', [table, db.tombstones], async (tx) => {
      markRemote(tx)
      for (const doc of docs) {
        const local = (await table.get(doc.id)) as Row | undefined
        const tomb = await db.tombstones.get(`${t}:${doc.id}`)
        const localU = Math.max(local?._u ?? 0, tomb?.u ?? 0)
        if (doc.u <= localU) continue // la version locale est aussi récente ou plus récente
        if (doc.data === null) {
          if (local) {
            await table.delete(doc.id)
            received++
          }
        } else {
          await table.put({ ...doc.data, _u: doc.u, _p: doc.u })
          received++
        }
        if (tomb) await db.tombstones.delete(tomb.key)
      }
    })
    state.lastPullS[t] = Math.max(state.lastPullS[t] ?? 0, ...docs.map((d) => d.s))
  }

  // ---------- 2. Envoi ----------
  let skipped = 0
  const outgoing: OutgoingDoc[] = []
  for (const t of SYNCED_TABLES) {
    const rows = (await db
      .table(t)
      .filter((r: Row) => isTracked(t, r) && (r._u ?? 1) > (r._p ?? 0))
      .toArray()) as Row[]
    for (const row of rows) {
      const data = toRemoteData(row)
      if (JSON.stringify(data).length > MAX_DOC_BYTES) {
        skipped++
        continue
      }
      outgoing.push({ t, id: primaryKey(t, row), data, u: row._u ?? 1 })
    }
  }
  const tombs: Tombstone[] = await db.tombstones.toArray()
  for (const tb of tombs) outgoing.push({ t: tb.t, id: tb.id, data: null, u: tb.u })

  if (outgoing.length > 0) {
    await remote.push(outgoing)
    // Marque comme envoyé ce qui l'a été, sans toucher aux enregistrements modifiés entre-temps.
    for (const t of SYNCED_TABLES) {
      const sent = outgoing.filter((d) => d.t === t && d.data !== null)
      if (sent.length === 0) continue
      const table = db.table(t)
      await db.transaction('rw', table, async (tx) => {
        markRemote(tx)
        for (const d of sent) {
          const row = (await table.get(d.id)) as Row | undefined
          if (row && row._u === d.u) await table.update(d.id, { _p: d.u })
        }
      })
    }
    await db.transaction('rw', db.tombstones, async () => {
      for (const tb of tombs) {
        const cur = await db.tombstones.get(tb.key)
        if (cur && cur.u === tb.u) await db.tombstones.delete(tb.key)
      }
    })
  }

  state.lastSync = Date.now()
  await saveSyncState(db, state)
  return { sent: outgoing.length, received, skipped }
}
