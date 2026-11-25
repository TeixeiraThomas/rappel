import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { applyTheme } from '../lib/theme'
import { askConfirm, toast } from '../components/ui'
import { db, getSettings, saveSettings } from '../db'
import { DataSafety } from '../components/DataSafety'
import { AccountSync } from '../components/AccountSync'
import { autoBackup, restoreBackupSafely } from '../lib/autobackup'
import { exportBackup, markBackupDone, validateBackup, type Backup } from '../lib/backup'
import { downloadFile } from '../lib/download'
import { friendlyError } from '../lib/errors'
import { csvToCards, detectDelimiter, importCards, parseCsv, type CsvParsed } from '../lib/csv'
import { buildTree, createDeck, flattenTree } from '../lib/decks'
import { DEFAULT_SETTINGS, type Settings } from '../types'

const num = (v: string, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function SettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const flat = useMemo(() => flattenTree(buildTree(decks ?? [])), [decks])

  useEffect(() => {
    getSettings().then((v) => {
      setS(v)
      setReady(true)
    })
  }, [])

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch }
    setS(next)
    void saveSettings(patch)
    if (patch.theme) applyTheme(patch.theme)
  }

  // --- Import CSV ---
  const csvRef = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<{ name: string; parsed: CsvParsed } | null>(null)
  const [csvDeck, setCsvDeck] = useState('')
  const [skipDup, setSkipDup] = useState(true)

  const onCsvFile = async (file: File) => {
    const text = await file.text()
    const rows = parseCsv(text, detectDelimiter(text))
    const parsed = csvToCards(rows)
    setCsv({ name: file.name, parsed })
    setCsvDeck(csvDeck || flat[0]?.deck.id || '__new__')
  }

  const doCsvImport = async () => {
    if (!csv) return
    let deckId = csvDeck
    if (deckId === '__new__' || !deckId) {
      deckId = (await createDeck(csv.name.replace(/\.[^.]+$/, '') || 'Import CSV')).id
    }
    const r = await importCards(csv.parsed.cards, deckId, skipDup)
    const warn = r.safetyBackup ? '' : ' — sauvegarde de sécurité impossible (espace insuffisant ?)'
    toast(`${r.added} carte${r.added > 1 ? 's' : ''} importée${r.added > 1 ? 's' : ''}${r.duplicates ? `, ${r.duplicates} doublon(s) ignoré(s)` : ''}${warn}`)
    setCsv(null)
  }

  // --- Import Anki (.apkg) ---
  const apkgRef = useRef<HTMLInputElement>(null)
  const [apkgBusy, setApkgBusy] = useState(false)
  const [apkgMsg, setApkgMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const onApkgFile = async (file: File) => {
    setApkgBusy(true)
    setApkgMsg(null)
    try {
      // Chargé à la demande : JSZip et sql.js (WASM) ne pèsent pas sur le démarrage.
      const { importApkg, loadSqlJs } = await import('../lib/apkg')
      const SQL = await loadSqlJs()
      const r = await importApkg(await file.arrayBuffer(), SQL, file.name.replace(/\.[^.]+$/, '') || 'Import Anki')
      const ignored = r.skipped ? `, ${r.skipped} ignorée(s)` : ''
      setApkgMsg({ ok: true, text: `${r.notes} notes (${r.cards} cartes) et ${r.images} image(s) importées${ignored}.${r.safetyBackup ? '' : ' Sauvegarde de sécurité impossible (espace insuffisant ?).'}` })
    } catch (e) {
      setApkgMsg({ ok: false, text: friendlyError(e) })
    } finally {
      setApkgBusy(false)
    }
  }

  // --- Sauvegarde JSON ---
  const jsonRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [jsonError, setJsonError] = useState('')

  const doExport = async () => {
    const data = await exportBackup()
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`rappel-sauvegarde-${stamp}.json`, JSON.stringify(data), 'application/json')
    await markBackupDone()
    toast('Sauvegarde exportée')
  }

  const onJsonFile = async (file: File) => {
    setJsonError('')
    setPending(null)
    try {
      const data = JSON.parse(await file.text())
      const err = validateBackup(data)
      if (err) setJsonError(err)
      else setPending(data as Backup)
    } catch {
      setJsonError("Ce fichier n'est pas un JSON valide.")
    }
  }

  const doRestore = async (mode: 'replace' | 'merge') => {
    if (!pending) return
    if (mode === 'replace') {
      const ok = await askConfirm({
        title: 'Remplacer toutes les données ?',
        message: 'Les paquets, cartes et historiques actuels seront supprimés et remplacés par la sauvegarde.',
        okLabel: 'Remplacer',
        danger: true,
      })
      if (!ok) return
    }
    try {
      const r = await restoreBackupSafely(pending, mode)
      toast(`Restauré : ${r.notes} notes, ${r.cards} cartes${r.safetyBackup ? '' : ' (sauvegarde de sécurité impossible)'}`)
      setPending(null)
      const fresh = await getSettings()
      setS(fresh)
      applyTheme(fresh.theme)
    } catch (e) {
      setJsonError(friendlyError(e))
    }
  }

  const wipe = async () => {
    const ok = await askConfirm({
      title: 'Tout effacer ?',
      message: 'Toutes les données locales (cartes, historique, images, réglages) seront supprimées. Pensez à exporter une sauvegarde avant.',
      okLabel: 'Tout effacer',
      danger: true,
    })
    if (!ok) return
    await autoBackup('Avant effacement total')
    await Promise.all([db.decks.clear(), db.notes.clear(), db.cards.clear(), db.reviews.clear(), db.media.clear(), db.kv.clear()])
    setS(DEFAULT_SETTINGS)
    applyTheme(DEFAULT_SETTINGS.theme)
    toast('Données effacées')
  }

  if (!ready) return null

  return (
    <>
      <div className="page-head"><h1>Réglages</h1></div>

      <AccountSync />

      <section className="card section">
        <h2>Révision</h2>
        <p className="muted small">Les limites s'appliquent à l'ensemble de la collection, par journée d'étude (changement à 4 h).</p>
        <label className="field">
          <span className="lbl">Nouvelles cartes par jour</span>
          <input type="number" inputMode="numeric" min={0} max={9999} value={s.newPerDay} onChange={(e) => update({ newPerDay: num(e.target.value, 0, 9999, 20) })} />
        </label>
        <label className="field">
          <span className="lbl">Révisions maximum par jour</span>
          <input type="number" inputMode="numeric" min={0} max={9999} value={s.reviewsPerDay} onChange={(e) => update({ reviewsPerDay: num(e.target.value, 0, 9999, 200) })} />
        </label>
        <label className="field">
          <span className="lbl">Rétention visée : {Math.round(s.retention * 100)} %</span>
          <input type="range" min={0.7} max={0.97} step={0.01} value={s.retention} onChange={(e) => update({ retention: Number(e.target.value) })} style={{ width: '100%' }} />
          <span className="muted small">Plus la valeur est haute, plus les révisions sont fréquentes. 90 % est un bon compromis.</span>
        </label>
        <label className="row" style={{ marginBottom: 6 }}>
          <input type="checkbox" checked={s.typedAnswer} onChange={(e) => update({ typedAnswer: e.target.checked })} style={{ width: 20, height: 20 }} />
          <span>Mode « taper la réponse » par défaut</span>
        </label>
      </section>

      <section className="card section">
        <h2>Apparence</h2>
        <div className="seg" style={{ marginTop: 10 }}>
          {([['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Système']] as const).map(([v, l]) => (
            <button key={v} className={s.theme === v ? 'on' : ''} onClick={() => update({ theme: v })}>{l}</button>
          ))}
        </div>
      </section>

      <section className="card section">
        <h2>Importer un CSV</h2>
        <p className="muted small">Séparateur « ; », colonnes <code>recto;verso;tags</code> (tags séparés par des espaces). Un recto contenant <code>{'{{c1::…}}'}</code> devient une carte à trous.</p>
        <input ref={csvRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" tabIndex={-1} aria-label="Fichier CSV à importer"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onCsvFile(f); e.target.value = '' }} />
        <button className="btn" onClick={() => csvRef.current?.click()}>Choisir un fichier CSV</button>
        {csv && (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: '0 0 8px' }}>
              <strong>{csv.name}</strong> : {csv.parsed.cards.length} carte{csv.parsed.cards.length > 1 ? 's' : ''} valide{csv.parsed.cards.length > 1 ? 's' : ''}
              {csv.parsed.invalid.length > 0 && <span className="pill-err"> · {csv.parsed.invalid.length} ligne(s) ignorée(s) (n° {csv.parsed.invalid.slice(0, 8).join(', ')}{csv.parsed.invalid.length > 8 ? '…' : ''})</span>}
            </p>
            <div className="table-scroll">
              <table className="csv-preview">
                <thead><tr><th>Recto</th><th>Verso</th><th>Tags</th></tr></thead>
                <tbody>
                  {csv.parsed.cards.slice(0, 5).map((c, i) => <tr key={i}><td>{c.front}</td><td>{c.back}</td><td>{c.tags.join(' ')}</td></tr>)}
                </tbody>
              </table>
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              <span className="lbl">Importer dans le paquet</span>
              <select value={csvDeck} onChange={(e) => setCsvDeck(e.target.value)}>
                {flat.map((n) => <option key={n.deck.id} value={n.deck.id}>{n.path}</option>)}
                <option value="__new__">➕ Nouveau paquet (nom du fichier)</option>
              </select>
            </label>
            <label className="row" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} style={{ width: 20, height: 20 }} />
              <span>Ignorer les doublons</span>
            </label>
            <div className="row">
              <button className="btn primary" onClick={doCsvImport} disabled={csv.parsed.cards.length === 0}>Importer</button>
              <button className="btn" onClick={() => setCsv(null)}>Annuler</button>
            </div>
          </div>
        )}
      </section>

      <section className="card section">
        <h2>Importer un paquet Anki (.apkg)</h2>
        <p className="muted small">Reprend les cartes, tags et images. Les dates de révision d'Anki ne sont pas converties : les cartes arrivent comme nouvelles. Dans Anki, exportez avec « Prise en charge des anciennes versions ».</p>
        <input ref={apkgRef} type="file" accept=".apkg" className="sr-only" tabIndex={-1} aria-label="Paquet Anki (.apkg) à importer"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onApkgFile(f); e.target.value = '' }} />
        <button className="btn" onClick={() => apkgRef.current?.click()} disabled={apkgBusy}>{apkgBusy ? 'Import en cours…' : 'Choisir un fichier .apkg'}</button>
        {apkgMsg && <p className={apkgMsg.ok ? 'pill-ok' : 'pill-err'}>{apkgMsg.text}</p>}
      </section>

      <section className="card section">
        <h2>Sauvegarde complète (JSON)</h2>
        <p className="muted small">Contient paquets, cartes, historique de révision, images et réglages. À faire régulièrement : vos données ne sont stockées que sur cet appareil.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={doExport}>Exporter</button>
          <input ref={jsonRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Sauvegarde JSON à restaurer"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onJsonFile(f); e.target.value = '' }} />
          <button className="btn" onClick={() => jsonRef.current?.click()}>Importer une sauvegarde…</button>
        </div>
        {jsonError && <p className="pill-err">{jsonError}</p>}
        {pending && (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: '0 0 10px' }}>
              Sauvegarde du {new Date(pending.exportedAt).toLocaleString('fr-FR')} : {pending.decks.length} paquets, {pending.notes.length} notes, {pending.cards.length} cartes, {pending.reviews.length} révisions.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => doRestore('merge')}>Fusionner avec l'existant</button>
              <button className="btn danger" onClick={() => doRestore('replace')}>Tout remplacer</button>
              <button className="btn ghost" onClick={() => setPending(null)}>Annuler</button>
            </div>
          </div>
        )}
      </section>

      <DataSafety
        reminderDays={s.backupReminderDays}
        onReminderDays={(n) => update({ backupReminderDays: n })}
        onRestored={() => getSettings().then((v) => { setS(v); applyTheme(v.theme) })}
      />

      <section className="card section">
        <h2>Zone dangereuse</h2>
        <p className="muted small">Supprime toutes les données de cet appareil.</p>
        <button className="btn danger" onClick={wipe}>Tout effacer</button>
      </section>
    </>
  )
}
