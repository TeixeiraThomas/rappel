import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getSettings } from '../db'
import { backupReminderDue, exportBackup, getBackupStatus, markBackupDone, snoozeBackupReminder } from '../lib/backup'
import { downloadFile } from '../lib/download'
import { toast } from './ui'

/** Bandeau de rappel de sauvegarde, affiché sur l'écran des paquets quand elle est « due ». */
export function BackupReminder() {
  const [busy, setBusy] = useState(false)
  const info = useLiveQuery(async () => {
    const [status, settings] = await Promise.all([getBackupStatus(), getSettings()])
    const due = backupReminderDue({ now: Date.now(), ...status, intervalDays: settings.backupReminderDays })
    const ref = status.lastBackup ?? status.firstNoteAt
    const days = ref ? Math.floor((Date.now() - ref) / 86_400_000) : 0
    return { due, never: status.lastBackup === null, days }
  }, [])

  if (!info?.due) return null

  const doBackup = async () => {
    setBusy(true)
    try {
      downloadFile(`rappel-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportBackup()), 'application/json')
      await markBackupDone()
      toast('Sauvegarde exportée')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card banner anim-in" role="region" aria-label="Rappel de sauvegarde">
      <div className="grow">
        <strong>Pensez à sauvegarder vos cartes</strong>
        <div className="muted small">
          {info.never ? `Aucune sauvegarde exportée (première carte il y a ${info.days} jours).` : `Dernière sauvegarde il y a ${info.days} jours.`} Vos données ne sont stockées que sur cet appareil.
        </div>
      </div>
      <div className="row">
        <button className="btn primary small" onClick={doBackup} disabled={busy}>Exporter</button>
        <button className="btn small" onClick={() => void snoozeBackupReminder()}>Plus tard</button>
      </div>
    </div>
  )
}
