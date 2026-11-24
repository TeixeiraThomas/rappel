import { useEffect } from 'react'
import { getSettings } from './db'
import { IconChart, IconDecks, IconSearch, IconSettings } from './components/icons'
import { DialogHost } from './components/ui'
import { href, useRoute } from './router'
import { Browse } from './pages/Browse'
import { Home } from './pages/Home'
import { NoteEditor } from './pages/NoteEditor'
import { SettingsPage } from './pages/SettingsPage'
import { Stats } from './pages/Stats'
import { Study } from './pages/Study'

/** Applique le thème (sombre par défaut, clair, ou celui du système). */
export function applyTheme(theme: 'dark' | 'light' | 'auto') {
  const resolved = theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f4f5f8' : '#0f1115')
}

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
      {studying ? page : <main className="content">{page}</main>}
      <DialogHost />
    </div>
  )
}
