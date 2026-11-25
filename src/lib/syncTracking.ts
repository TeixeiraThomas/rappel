import type Dexie from 'dexie'
import type { Transaction } from 'dexie'

/**
 * Suivi local des modifications pour la synchronisation entre appareils.
 *
 * - Chaque création ou modification d'un enregistrement synchronisé reçoit un horodatage `_u` (ms).
 * - Chaque suppression laisse une « pierre tombale » (table `tombstones`) pour être propagée.
 * - Les écritures qui viennent du serveur sont faites dans une transaction marquée « distante » :
 *   elles ne changent pas `_u` et ne créent pas de pierre tombale (sinon les appareils se renverraient
 *   les mêmes changements à l'infini).
 */

export const SYNCED_TABLES = ['decks', 'notes', 'cards', 'reviews', 'media', 'kv'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

/** Clé kv synchronisée : seuls les réglages voyagent, le reste du kv est propre à l'appareil. */
export const SYNCED_KV_KEYS = new Set(['settings'])

export interface Tombstone {
  /** `${table}:${id}` */
  key: string
  t: SyncedTable
  id: string
  /** Moment de la suppression (ms). */
  u: number
}

const REMOTE_FLAG = '__rappelRemote'

/** Marque la transaction courante comme application de changements venus du serveur. */
export function markRemote(tx: Transaction | null | undefined): void {
  if (tx) (tx as unknown as Record<string, unknown>)[REMOTE_FLAG] = true
}

function isRemote(tx: Transaction | null | undefined): boolean {
  return Boolean(tx && (tx as unknown as Record<string, unknown>)[REMOTE_FLAG])
}

/** Vrai si cet enregistrement doit être synchronisé (kv : seulement les réglages). */
export function isTracked(t: SyncedTable, obj: unknown): boolean {
  if (t !== 'kv') return true
  const key = (obj as { key?: unknown } | undefined)?.key
  return typeof key === 'string' && SYNCED_KV_KEYS.has(key)
}

/** Horloge strictement croissante : deux modifications dans la même milliseconde restent ordonnées. */
let lastStamp = 0
export function stamp(): number {
  const now = Date.now()
  lastStamp = now > lastStamp ? now : lastStamp + 1
  return lastStamp
}

/** Installe les hooks de suivi sur une base Dexie (appelé dans le constructeur de la base). */
export function installSyncTracking(db: Dexie): void {
  const pending: Tombstone[] = []
  let scheduled = false
  let inflight: Promise<unknown> = Promise.resolve()
  const flush = () => {
    scheduled = false
    const batch = pending.splice(0)
    if (batch.length) inflight = inflight.then(() => db.table('tombstones').bulkPut(batch)).catch(() => undefined)
  }
  // Permet au moteur de synchro d'attendre que les dernières pierres tombales soient écrites.
  ;(db as unknown as { waitTombstones: () => Promise<void> }).waitTombstones = async () => {
    await new Promise((r) => setTimeout(r, 0))
    flush()
    await inflight
  }

  for (const t of SYNCED_TABLES) {
    const table = db.table(t)
    table.hook('creating', function (_pk, obj, tx) {
      if (isRemote(tx) || !isTracked(t, obj)) return
      ;(obj as Record<string, unknown>)._u = stamp()
    })
    table.hook('updating', function (mods, _pk, obj, tx) {
      if (isRemote(tx) || !isTracked(t, obj)) return
      // Une mise à jour qui ne touche que l'état de synchro (_p) ne compte pas comme une modification.
      const keys = Object.keys(mods as object)
      if (keys.length > 0 && keys.every((k) => k === '_p')) return
      return { _u: stamp() }
    })
    table.hook('deleting', function (pk, obj, tx) {
      if (isRemote(tx) || !isTracked(t, obj)) return
      const entry: Tombstone = { key: `${t}:${String(pk)}`, t, id: String(pk), u: stamp() }
      // La pierre tombale n'est enregistrée que si la suppression est réellement validée.
      tx.on('complete', () => {
        pending.push(entry)
        if (!scheduled) {
          scheduled = true
          setTimeout(flush, 0)
        }
      })
    })
  }
}
