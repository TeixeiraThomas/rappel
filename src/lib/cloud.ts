import { db } from '../db'
import { firebaseConfig, isCloudConfigured } from './firebase-config'
import { getSyncState, hasLocalChanges, resetSyncState, runSync, type OutgoingDoc, type Remote, type RemoteDoc, type SyncResult } from './sync'
import type { SyncedTable } from './syncTracking'

/**
 * Compte et synchronisation avec Firebase (Authentication + Firestore Lite).
 * Firebase n'est chargé qu'à la demande : l'app reste légère et 100 % hors ligne sans compte.
 *
 * Données sur le serveur : users/{uid}/{table}/{id} = { data, u, s, del }
 */

export interface CloudUser {
  uid: string
  email: string | null
}

export type SyncPhase = 'idle' | 'syncing' | 'ok' | 'offline' | 'error'

export interface CloudStatus {
  configured: boolean
  /** undefined = état de connexion pas encore connu. */
  user: CloudUser | null | undefined
  phase: SyncPhase
  message: string
  lastSync: number | null
}

let status: CloudStatus = {
  configured: isCloudConfigured(),
  user: undefined,
  phase: 'idle',
  message: '',
  lastSync: null,
}
const listeners = new Set<(s: CloudStatus) => void>()

function setStatus(patch: Partial<CloudStatus>) {
  status = { ...status, ...patch }
  for (const l of listeners) l(status)
}

export function getCloudStatus(): CloudStatus {
  return status
}

export function subscribeCloud(fn: (s: CloudStatus) => void): () => void {
  listeners.add(fn)
  fn(status)
  return () => listeners.delete(fn)
}

// ---------------------------------------------------------------- chargement de Firebase

type Firebase = Awaited<ReturnType<typeof loadFirebase>>
let firebase: Promise<Firebase> | null = null

async function loadFirebase() {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore/lite'),
  ])
  const app = initializeApp(firebaseConfig)
  const auth = authMod.getAuth(app)
  auth.languageCode = 'fr'
  const store = fs.getFirestore(app)
  return { authMod, auth, fs, store }
}

function fb(): Promise<Firebase> {
  if (!isCloudConfigured()) return Promise.reject(new Error('Synchronisation non configurée.'))
  firebase ??= loadFirebase()
  return firebase
}

// ---------------------------------------------------------------- service distant Firestore

const BATCH_SIZE = 400 // une écriture groupée Firestore accepte 500 opérations au maximum

function firestoreRemote(f: Firebase, uid: string): Remote {
  const { fs, store } = f
  return {
    async pull(t: SyncedTable, sinceS: number): Promise<RemoteDoc[]> {
      const col = fs.collection(store, 'users', uid, t)
      const q = sinceS > 0 ? fs.query(col, fs.where('s', '>', fs.Timestamp.fromMillis(sinceS))) : col
      const snap = await fs.getDocs(q)
      return snap.docs.map((d) => {
        const v = d.data() as { data?: Record<string, unknown>; u?: number; s?: { toMillis(): number }; del?: boolean }
        return { t, id: d.id, data: v.del ? null : (v.data ?? null), u: v.u ?? 0, s: v.s?.toMillis() ?? 0 }
      })
    },
    async push(docs: OutgoingDoc[]): Promise<void> {
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = fs.writeBatch(store)
        for (const d of docs.slice(i, i + BATCH_SIZE)) {
          const ref = fs.doc(store, 'users', uid, d.t, d.id)
          batch.set(ref, d.data === null
            ? { del: true, u: d.u, s: fs.serverTimestamp() }
            : { data: d.data, u: d.u, s: fs.serverTimestamp() })
        }
        await batch.commit()
      }
    },
  }
}

// ---------------------------------------------------------------- compte

/** Traduit les erreurs Firebase en messages compréhensibles. */
export function cloudErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/missing-password': 'Saisissez un mot de passe.',
    'auth/weak-password': 'Mot de passe trop faible : 6 caractères minimum.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse : connectez-vous.',
    'auth/invalid-credential': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte avec cette adresse.',
    'auth/too-many-requests': 'Trop de tentatives : réessayez dans quelques minutes.',
    'auth/network-request-failed': 'Pas de connexion Internet.',
    'permission-denied': 'Accès refusé par le serveur.',
    unavailable: 'Serveur injoignable (hors ligne ?).',
  }
  if (map[code]) return map[code]
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Pas de connexion Internet.'
  return (e as Error)?.message || 'Erreur inconnue.'
}

let authWatching = false

/** Démarre le suivi de connexion (et la synchro automatique quand un compte est connecté). */
export async function startCloud(): Promise<void> {
  if (!isCloudConfigured() || authWatching) return
  authWatching = true
  const f = await fb()
  f.authMod.onAuthStateChanged(f.auth, (u) => {
    const user = u ? { uid: u.uid, email: u.email } : null
    setStatus({ user })
    if (user) void syncNow({ quiet: true })
  })
}

export async function signUp(email: string, password: string): Promise<void> {
  const f = await fb()
  await f.authMod.createUserWithEmailAndPassword(f.auth, email.trim(), password)
}

export async function signIn(email: string, password: string): Promise<void> {
  const f = await fb()
  await f.authMod.signInWithEmailAndPassword(f.auth, email.trim(), password)
}

export async function resetPassword(email: string): Promise<void> {
  const f = await fb()
  await f.authMod.sendPasswordResetEmail(f.auth, email.trim())
}

/** Déconnexion : les données restent sur l'appareil ; la prochaine connexion refait une synchro complète. */
export async function signOutCloud(): Promise<void> {
  const f = await fb()
  await f.authMod.signOut(f.auth)
  await resetSyncState(db)
  setStatus({ phase: 'idle', message: '', lastSync: null })
}

// ---------------------------------------------------------------- synchronisation

let running: Promise<SyncResult | null> | null = null
let lastAuto = 0

/** Synchronise maintenant (une seule synchro à la fois). */
export function syncNow(opts: { quiet?: boolean } = {}): Promise<SyncResult | null> {
  if (running) return running
  running = (async () => {
    const user = status.user
    if (!user) return null
    setStatus({ phase: 'syncing', message: 'Synchronisation…' })
    try {
      const f = await fb()
      const r = await runSync(db, firestoreRemote(f, user.uid), user.uid)
      const parts = [`${r.sent} envoyé${r.sent > 1 ? 's' : ''}`, `${r.received} reçu${r.received > 1 ? 's' : ''}`]
      if (r.skipped) parts.push(`${r.skipped} image(s) trop lourde(s) non envoyée(s)`)
      setStatus({ phase: 'ok', message: `À jour : ${parts.join(', ')}.`, lastSync: Date.now() })
      lastAuto = Date.now()
      return r
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      setStatus({ phase: offline ? 'offline' : 'error', message: opts.quiet && offline ? 'Hors ligne : synchro dès le retour du réseau.' : cloudErrorMessage(e) })
      return null
    } finally {
      running = null
    }
  })()
  return running
}

/**
 * Synchro automatique : au démarrage (si un compte était connecté), au retour sur l'app,
 * quand on la quitte (s'il reste des changements), au retour du réseau et toutes les 5 minutes.
 */
export function installAutoSync(): void {
  if (!isCloudConfigured() || typeof window === 'undefined') return
  // Firebase n'est chargé au démarrage que si ce navigateur a déjà été connecté à un compte.
  void getSyncState(db).then((s) => {
    if (s) {
      setStatus({ lastSync: s.lastSync })
      void startCloud()
    } else setStatus({ user: null })
  })
  const auto = async (force = false) => {
    if (!status.user) return
    if (!force && Date.now() - lastAuto < 60_000) return
    void syncNow({ quiet: true })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void auto()
    else
      void hasLocalChanges(db).then((dirty) => {
        if (dirty) void auto(true)
      })
  })
  window.addEventListener('online', () => void auto(true))
  window.setInterval(() => void auto(), 5 * 60_000)
}
