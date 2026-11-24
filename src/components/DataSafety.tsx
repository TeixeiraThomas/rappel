import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { deleteAutoBackup, getAutoBackup, listAutoBackups, restoreBackupSafely } from '../lib/autobackup'
import { downloadFile } from '../lib/download'
import { formatBytes, getStorageInfo, requestPersistence, type StorageInfo } from '../lib/storage'
import { askConfirm, toast } from './ui'

/** Section « Sécurité des données » : stockage persistant, rappel, sauvegardes automatiques. */
export function DataSafety({
  reminderDays,
  onReminderDays,
  onRestored,
}: {
  reminderDays: number
  onReminderDays: (n: number) => void
  onRestored: () => void
}) {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const snapshots = useLiveQuery(() => listAutoBackups(), [])

  const refresh = () => void getStorageInfo().then(setInfo)
  useEffect(refresh, [])

  const askPersist = async () => {
    const ok = await requestPersistence()
    refresh()
    toast(ok ? 'Stockage protégé contre la purge' : "Le navigateur n'a pas accordé la protection (installez l'app ou utilisez-la plus souvent)")
  }

  const restore = async (id: string) => {
    const ok = await askConfirm({
      title: 'Restaurer cette sauvegarde automatique ?',
      message: 'Les données actuelles seront remplacées (un nouvel instantané de l’état actuel est pris avant).',
      okLabel: 'Restaurer',
      danger: true,
    })
    if (!ok) return
    const data = await getAutoBackup(id)
    if (!data) return toast('Sauvegarde introuvable')
    const r = await restoreBackupSafely(data, 'replace')
    toast(`Restauré : ${r.notes} notes, ${r.cards} cartes`)
    onRestored()
  }

  const download = async (id: string, ts: number) => {
    const data = await getAutoBackup(id)
    if (data) downloadFile(`rappel-auto-${new Date(ts).toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json')
  }

  const remove = async (id: string) => {
    const ok = await askConfirm({ title: 'Supprimer cette sauvegarde automatique ?', message: 'Elle ne pourra plus être restaurée.', okLabel: 'Supprimer', danger: true })
    if (ok) await deleteAutoBackup(id)
  }

  return (
    <section className="card section" aria-labelledby="h-safety">
      <h2 id="h-safety">Sécurité des données</h2>
      <p className="muted small">Vos données sont uniquement stockées sur cet appareil.</p>

      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="grow">
          <div>
            Stockage protégé : {info === null ? '…' : !info.supported ? 'non disponible' : info.persisted ? <span className="pill-ok">oui ✓</span> : <span className="pill-err">non</span>}
          </div>
          <div className="muted small">Utilisé : {formatBytes(info?.usage ?? null)} sur {formatBytes(info?.quota ?? null)} disponibles</div>
        </div>
        {info?.supported && !info.persisted && <button className="btn small" onClick={askPersist}>Protéger le stockage</button>}
      </div>

      <label className="field">
        <span className="lbl">Rappel de sauvegarde</span>
        <select value={reminderDays} onChange={(e) => onReminderDays(Number(e.target.value))}>
          <option value={0}>Désactivé</option>
          <option value={3}>Tous les 3 jours</option>
          <option value={7}>Toutes les semaines</option>
          <option value={14}>Toutes les 2 semaines</option>
          <option value={30}>Tous les mois</option>
        </select>
      </label>

      <h3 style={{ fontSize: '1rem', margin: '16px 0 4px' }}>Sauvegardes automatiques</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Un instantané est pris avant chaque import ou restauration (les 5 dernières sont gardées).</p>
      {!snapshots || snapshots.length === 0 ? (
        <p className="muted small">Aucune pour l'instant.</p>
      ) : (
        <ul className="plain-list">
          {snapshots.map((b) => (
            <li key={b.id} className="row" style={{ flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div className="grow">
                <div>{b.reason}</div>
                <div className="muted small">{new Date(b.ts).toLocaleString('fr-FR')} · {b.notes} notes · {b.cards} cartes</div>
              </div>
              <button className="btn small" onClick={() => restore(b.id)}>Restaurer</button>
              <button className="btn small" onClick={() => download(b.id, b.ts)}>Télécharger</button>
              <button className="btn small danger" onClick={() => remove(b.id)} aria-label={`Supprimer la sauvegarde du ${new Date(b.ts).toLocaleString('fr-FR')}`}>Supprimer</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

