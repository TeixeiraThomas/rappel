import { useEffect, useState } from 'react'
import { toast } from './ui'
import {
  cloudErrorMessage, resetPassword, signIn, signOutCloud, signUp, startCloud, subscribeCloud, syncNow,
  type CloudStatus,
} from '../lib/cloud'

/** Section « Compte et synchronisation » des réglages. */
export function AccountSync() {
  const [st, setSt] = useState<CloudStatus | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeCloud(setSt), [])
  // Sur cet écran, on charge Firebase pour connaître l'état de connexion.
  useEffect(() => {
    if (st?.configured) void startCloud().catch((e) => setError(cloudErrorMessage(e)))
  }, [st?.configured])

  if (!st?.configured) return null

  const run = async (fn: () => Promise<void>) => {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(cloudErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const user = st.user
  return (
    <section className="card section" aria-labelledby="account-title">
      <h2 id="account-title">Compte et synchronisation</h2>
      {user === undefined && <p className="muted small">Chargement…</p>}

      {user === null && (
        <>
          <p className="muted small">
            Connectez-vous avec le même compte sur chaque appareil (PC, téléphone…) : vos paquets, cartes et progrès
            se synchronisent automatiquement. Importez vos cartes sur un seul appareil, la synchro fait le reste.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); void run(() => signIn(email, password)) }}>
            <label className="field">
              <span className="lbl">Adresse e-mail</span>
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span className="lbl">Mot de passe (6 caractères minimum)</span>
              <input type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="pill-err" role="alert">{error}</p>}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn primary" type="submit" disabled={busy}>Se connecter</button>
              <button className="btn" type="button" disabled={busy} onClick={() => void run(() => signUp(email, password))}>Créer un compte</button>
              <button
                className="btn ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!email.trim()) return setError('Saisissez d’abord votre adresse e-mail.')
                  void run(async () => {
                    await resetPassword(email)
                    toast('E-mail de réinitialisation envoyé.')
                  })
                }}
              >
                Mot de passe oublié ?
              </button>
            </div>
          </form>
        </>
      )}

      {user && (
        <>
          <p style={{ margin: '4px 0 6px' }}>Connecté : <strong>{user.email}</strong></p>
          <p className={st.phase === 'error' ? 'pill-err' : st.phase === 'ok' ? 'pill-ok' : 'muted small'} role="status">
            {st.message || (st.lastSync ? `Dernière synchro : ${new Date(st.lastSync).toLocaleString('fr-FR')}` : 'Pas encore synchronisé.')}
          </p>
          {error && <p className="pill-err" role="alert">{error}</p>}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={st.phase === 'syncing'} onClick={() => void syncNow()}>
              {st.phase === 'syncing' ? 'Synchronisation…' : 'Synchroniser maintenant'}
            </button>
            <button className="btn" disabled={busy || st.phase === 'syncing'} onClick={() => void run(signOutCloud)}>Se déconnecter</button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            La synchro se fait aussi toute seule : à l'ouverture de l'app, quand vous la quittez et toutes les 5 minutes.
            En cas de modification de la même carte sur deux appareils, la plus récente l'emporte.
          </p>
        </>
      )}
    </section>
  )
}
