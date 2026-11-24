import { lazy, Suspense, useEffect } from 'react'
import { getSettings } from './db'
import { IconChart, IconDecks, IconSearch, IconSettings } from './components/icons'
import { DialogHost } from './components/ui'
import { applyTheme } from './lib/theme'
import { href, useRoute } from './router'
import { Home } from './pages/Home'
import { Study } from './pages/Study'

// Écrans secondaires chargés à la demande : démarrage plus rapide (tout reste précaché hors ligne).
const Browse = lazy(() => import('./pages/Browse').then((m) => ({ default: m.Browse })))
const NoteEditor = lazy(() => import('./pages/NoteEditor').then((m) => ({ default: m.NoteEditor })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })))

export default function App() {
  const route = useRoute()
  const [section, arg] = route.path

  useEffect(() => {
    getSettings().then((s) => applyTheme(s.theme))
  }, [])

  let page
  switch (section) {
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
      page = <Home />
  }

  const studying = section === 'study'
  const active = (s: string) => (section === s || (s === 'decks' && !section) ? 'active' : '')

  return (
    <div className={`app${studying ? ' study-mode' : ''}`}>
      {!studying && (
        <nav className="nav" aria-label="Navigation principale">
          <div className="brand"><img src="icon.svg" alt="" />Rappel</div>
          <a href={href('/')} className={active('decks')}><IconDecks />Paquets</a>
          <a href={href('/browse')} className={active('browse')}><IconSearch />Parcourir</a>
          <a href={href('/stats')} className={active('stats')}><IconChart />Stats</a>
          <a href={href('/settings')} className={active('settings')}><IconSettings />Réglages</a>
        </nav>
      )}
      <Suspense fallback={null}>{studying ? page : <main className="content">{page}</main>}</Suspense>
      <DialogHost />
    </div>
  )
}
