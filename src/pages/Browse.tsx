import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { stripCloze } from '../lib/cloze'
import { buildTree, flattenTree } from '../lib/decks'
import { preview } from '../lib/markdown'
import { allTags, setSuspended } from '../lib/notes'
import { matchNote, parseQuery } from '../lib/search'
import { href, navigate } from '../router'
import { IconPlus } from '../components/icons'

const TYPE_LABEL = { basic: 'Recto/verso', reversed: '+ inverse', cloze: 'Trous' } as const
const PAGE = 100

export function Browse({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [limit, setLimit] = useState(PAGE)
  const notes = useLiveQuery(() => db.notes.orderBy('updated').reverse().toArray(), [])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const tags = useLiveQuery(() => allTags(), [])

  useEffect(() => setQuery(initialQuery), [initialQuery])
  useEffect(() => setLimit(PAGE), [query])

  const paths = useMemo(() => new Map(flattenTree(buildTree(decks ?? [])).map((n) => [n.deck.id, n.path])), [decks])
  const cardsByNote = useMemo(() => {
    const m = new Map<string, { n: number; suspended: boolean }>()
    for (const c of cards ?? []) {
      const e = m.get(c.noteId) ?? { n: 0, suspended: false }
      e.n++
      if (c.suspended) e.suspended = true
      m.set(c.noteId, e)
    }
    return m
  }, [cards])

  const results = useMemo(() => {
    const p = parseQuery(query)
    return (notes ?? []).filter((n) => matchNote(n, p, paths.get(n.deckId) ?? ''))
  }, [notes, query, paths])

  const addTag = (t: string) => {
    const token = `tag:${t}`
    setQuery((q) => (q.split(/\s+/).includes(token) ? q : `${q} ${token}`.trim()))
  }

  if (!notes) return null

  return (
    <>
      <div className="page-head">
        <h1>Parcourir</h1>
        <a className="btn small" href={href('/new')}><IconPlus />Carte</a>
      </div>

      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : mot, tag:cisco, deck:réseau, type:cloze" aria-label="Rechercher des cartes" />

      {tags && tags.length > 0 && (
        <div className="chips scroll" style={{ margin: '10px 0' }}>
          {tags.map((t) => (
            <button key={t.tag} className="chip" onClick={() => addTag(t.tag)}>#{t.tag} · {t.count}</button>
          ))}
        </div>
      )}

      <p className="muted small">{results.length} note{results.length > 1 ? 's' : ''}{query.trim() ? ' trouvée' + (results.length > 1 ? 's' : '') : ''}</p>

      {results.length === 0 ? (
        <div className="empty card">
          <h2>{notes.length === 0 ? 'Aucune carte' : 'Aucun résultat'}</h2>
          <p>{notes.length === 0 ? 'Ajoutez votre première carte avec le bouton « Carte ».' : 'Essayez d’autres mots-clés.'}</p>
        </div>
      ) : (
        <div className="card">
          {results.slice(0, limit).map((n) => {
            const info = cardsByNote.get(n.id)
            return (
              <div key={n.id} className="note-row">
                <button className="note-item" onClick={() => navigate(`/edit/${n.id}`)}>
                  <div className="title">{preview(stripCloze(n.front), 120)}</div>
                  <div className="sub">{n.type === 'cloze' ? preview(n.back || '—', 120) : preview(n.back, 120)}</div>
                  <div className="meta">
                    <span className="chip">{paths.get(n.deckId) ?? '?'}</span>
                    <span className="muted small">{TYPE_LABEL[n.type]} · {info?.n ?? 0} carte{(info?.n ?? 0) > 1 ? 's' : ''}</span>
                    {info?.suspended && <span className="badge">suspendue</span>}
                    {n.tags.map((t) => <span key={t} className="muted small">#{t}</span>)}
                  </div>
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => void setSuspended(n.id, !info?.suspended)}
                  aria-label={`${info?.suspended ? 'Réactiver' : 'Suspendre'} : ${preview(stripCloze(n.front), 40)}`}
                >
                  {info?.suspended ? 'Réactiver' : 'Suspendre'}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {results.length > limit && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn" onClick={() => setLimit(limit + PAGE)}>Afficher plus ({results.length - limit})</button>
        </div>
      )}
    </>
  )
}
