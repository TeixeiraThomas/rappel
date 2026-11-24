import Dexie, { type Table } from 'dexie'
import { db } from '../db'
import { exportBackup, restoreBackup, type Backup, type RestoreResult } from './backup'

// Sauvegardes automatiques prises AVANT toute opération risquée (import, restauration, effacement).
// Elles vivent dans une base IndexedDB séparée : « Tout effacer » ou une restauration ratée de la
// base principale ne les touche pas. On conserve les 5 plus récentes.

export interface AutoBackup {
  id: string
  ts: number
  /** Raison lisible : « Avant import CSV »… */
  reason: string
  notes: number
  cards: number
  /** JSON de la sauvegarde complète. */
  json: string
}

class AutoBackupDB extends Dexie {
  snapshots!: Table<AutoBackup, string>
  constructor() {
    super('rappel-autobackups')
    this.version(1).stores({ snapshots: 'id, ts' })
  }
}

export const autoDb = new AutoBackupDB()
export const MAX_AUTO_BACKUPS = 5

/**
 * Enregistre un instantané de la collection actuelle. Ne fait rien si la collection est vide.
 * N'échoue jamais bruyamment : une sauvegarde impossible ne doit pas bloquer l'import (quota…) —
 * on renvoie false et l'appelant peut avertir l'utilisateur.
 */
export async function autoBackup(reason: string): Promise<boolean> {
  try {
    if ((await db.notes.count()) === 0 && (await db.decks.count()) === 0) return true
    const data = await exportBackup()
    const ts = Date.now()
    await autoDb.snapshots.put({
      id: `${ts}-${Math.random().toString(36).slice(2, 7)}`,
      ts,
      reason,
      notes: data.notes.length,
      cards: data.cards.length,
      json: JSON.stringify(data),
    })
    const all = await autoDb.snapshots.orderBy('ts').reverse().primaryKeys()
    if (all.length > MAX_AUTO_BACKUPS) await autoDb.snapshots.bulkDelete(all.slice(MAX_AUTO_BACKUPS))
    return true
  } catch {
    return false
  }
}

export async function listAutoBackups(): Promise<Omit<AutoBackup, 'json'>[]> {
  const rows = await autoDb.snapshots.orderBy('ts').reverse().toArray()
  return rows.map(({ json, ...rest }) => ({ ...rest, size: json.length })) as Omit<AutoBackup, 'json'>[]
}

export async function getAutoBackup(id: string): Promise<Backup | null> {
  const row = await autoDb.snapshots.get(id)
  return row ? (JSON.parse(row.json) as Backup) : null
}

export async function deleteAutoBackup(id: string): Promise<void> {
  await autoDb.snapshots.delete(id)
}

/** Restaure une sauvegarde après avoir pris un instantané de l'existant (annulable depuis les Réglages). */
export async function restoreBackupSafely(
  data: Backup,
  mode: 'replace' | 'merge',
): Promise<RestoreResult & { safetyBackup: boolean }> {
  const safetyBackup = await autoBackup(mode === 'replace' ? 'Avant restauration (remplacement)' : 'Avant restauration (fusion)')
  return { ...(await restoreBackup(data, mode)), safetyBackup }
}
