import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { db, getSettings } from './db'
import { ErrorBoundary, ErrorScreen } from './components/ErrorScreen'
import { IconChart, IconDecks, IconSearch, IconSettings } from './components/icons'
import { DialogHost, toast } from './components/ui'
import { friendlyError } from './lib/errors'
import { applyTheme } from './lib/theme'
import { installAutoSync } from './lib/cloud'
import { href, useRoute } from './router'
import { Home } from './pages/Home'
import { Study } from './pages/Study'

// Écrans secondaires chargés à la demande : démarrage plus rapide (tout reste précaché hors ligne).
const Browse = lazy(() => import('./pages/Browse').then((m) => ({ default: m.Browse })))
const NoteEditor = lazy(() => import('./pages/NoteEditor').then((m) => ({ default: m.NoteEditor })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })))

const TITLES: Record<string, string> = {
  browse: 'Parcourir',
  new: 'Nouvelle carte',
  edit: 'Modifier la carte',
  stats: 'Statistiques',
  settings: 'Réglages',
  study: 'Révision',
}

function NotFound() {
  return (
    <div className="empty card">
      <h2>Page introuvable</h2>
      <p>Cette adresse ne correspond à aucun écran de l'application.</p>
      <a className="btn primary" href={href('/')}>Retour aux paquets</a>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const mainRef = useRef<HTMLElement>(null)
  const [section, arg] = route.path
  // Erreur d'ouverture de la base locale (navigation privée, accès bloqué…) : écran dédié.
  const [dbError, setDbError] = useState<unknown>(null)

  useEffect(() => {
    db.open()
      .then(() => getSettings())
      .then((s) => applyTheme(s.theme))
      .then(() => installAutoSync())
      .catch(setDbError)
    // Dernier filet : une promesse rejetée non gérée devient un message lisible, jamais un échec silencieux.
    const onRejection = (e: PromiseRejectionEvent) => {
      toast(friendlyError(e.reason))
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  // Titre de la fenêtre / de l'onglet, annoncé par les lecteurs d'écran à chaque changement d'écran.
  useEffect(() => {
    document.title = section && TITLES[section] ? `${TITLES[section]} — Rappel` : 'Rappel'
  }, [section])

  if (dbError) return <ErrorScreen title="Stockage local indisponible" error={dbError} />

  let page
  switch (section) {
    case undefined:
      page = <Home />
      break
    case 'study':
      page = <Study key={arg ?? 'all'} deckId={arg && arg !== 'all' ? arg : null} />
      break
    case 'new':
      page = <NoteEditor key={'new' + route.query.toString()} noteId={null} initialDeck={route.query.get('deck')} />
      break
    case 'edit':
      page = <NoteEditor key={arg} noteId={arg ?? null} initialDeck={null} />
      break
    case 'browse':
      page = <Browse initialQuery={route.query.get('q') ?? ''} />
      break
    case 'stats':
      page = <Stats />
      break
    case 'settings':
      page = <SettingsPage />
      break
    default:
      page = <NotFound />
  }

  const studying = section === 'study'
  const current = (s: string) => (section === s || (s === 'decks' && !section) ? 'page' : undefined)

  return (
    <div className={`app${studying ? ' study-mode' : ''}`}>
      {!studying && (
        <a
          className="skip-link"
          href="#/"
          onClick={(e) => {
            e.preventDefault() // pas de navigation : on déplace seulement le focus
            mainRef.current?.focus()
          }}
        >
          Aller au contenu
        </a>
      )}
      {!studying && (
        <nav className="nav" aria-label="Navigation principale">
          <div className="brand"><img src="icon.svg" alt="" />Rappel</div>
          <a href={href('/')} className={current('decks') ? 'active' : ''} aria-current={current('decks')}><IconDecks />Paquets</a>
          <a href={href('/browse')} className={current('browse') ? 'active' : ''} aria-current={current('browse')}><IconSearch />Parcourir</a>
          <a href={href('/stats')} className={current('stats') ? 'active' : ''} aria-current={current('stats')}><IconChart />Stats</a>
          <a href={href('/settings')} className={current('settings') ? 'active' : ''} aria-current={current('settings')}><IconSettings />Réglages</a>
        </nav>
      )}
      <ErrorBoundary key={section ?? 'accueil'}>
        <Suspense fallback={null}>
          {studying ? page : <main className="content" id="contenu" tabIndex={-1} ref={mainRef}>{page}</main>}
        </Suspense>
      </ErrorBoundary>
      <DialogHost />
    </div>
  )
}
