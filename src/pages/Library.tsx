import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { IconCheck } from '../components/icons'
import { toast } from '../components/ui'
import { getSettings } from '../db'
import { friendlyError } from '../lib/errors'
import { installedCount, installModule, moduleRootDeck } from '../lib/library'
import { CATEGORIES, MODULES } from '../modules/catalog'
import type { ModuleCategory, ModuleContent, ModuleMeta } from '../modules/types'
import { navigate } from '../router'

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

/** Durée indicative pour voir toutes les cartes au rythme des nouvelles cartes par jour. */
function pace(cards: number, perDay: number): string {
  if (perDay <= 0) return 'nouvelles cartes désactivées dans les Réglages'
  const days = Math.ceil(cards / perDay)
  const span = days < 14 ? plural(days, 'jour', 'jours') : `≈ ${plural(Math.round(days / 7), 'semaine', 'semaines')}`
  return `${span} à ${perDay} nouvelles cartes par jour`
}

export function Library() {
  const [filter, setFilter] = useState<ModuleCategory | 'all'>('all')
  const settings = useLiveQuery(() => getSettings(), [])
  // Nombre de notes de chaque module déjà présentes (tag du module), recalculé à chaque changement de la collection.
  const installed = useLiveQuery(async () => {
    const counts = await Promise.all(MODULES.map((m) => installedCount(m.id)))
    return new Map(MODULES.map((m, i) => [m.id, counts[i]]))
  }, [])

  const shown = CATEGORIES.filter((c) => filter === 'all' || c.id === filter)
    .map((c) => ({ ...c, modules: MODULES.filter((m) => m.category === c.id) }))
    .filter((c) => c.modules.length > 0)

  return (
    <>
      <div className="page-head">
        <h1>Modules</h1>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Des cartes prêtes à réviser, rédigées d'après les programmes officiels. Ajoutez un module : il devient un paquet,
        avec un sous-paquet par chapitre, et ses cartes arrivent au rythme de vos nouvelles cartes quotidiennes.
      </p>

      <div className="chips scroll lib-filters" role="group" aria-label="Filtrer par catégorie">
        <button className={`chip${filter === 'all' ? ' on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Tous
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip${filter === c.id ? ' on' : ''}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {shown.map((cat) => (
        <section key={cat.id} className="lib-cat" aria-labelledby={`cat-${cat.id}`}>
          <h2 id={`cat-${cat.id}`}>{cat.label}</h2>
          {cat.modules.map((m) => (
            <ModuleCard key={m.id} meta={m} have={installed?.get(m.id)} perDay={settings?.newPerDay ?? 20} />
          ))}
        </section>
      ))}

      <p className="muted small" style={{ textAlign: 'center', marginTop: 20 }}>
        Contenu rédigé pour Rappel d'après les programmes publiés. Les examens évoluent : en cas de doute, vérifiez dans
        un cours officiel et corrigez la carte (une carte que vous modifiez n'est plus touchée par les mises à jour).
      </p>
    </>
  )
}

function ModuleCard({ meta, have, perDay }: { meta: ModuleMeta; have: number | undefined; perDay: number }) {
  const [busy, setBusy] = useState(false)
  const [content, setContent] = useState<ModuleContent | null>(null)
  const isIn = (have ?? 0) > 0
  const missing = isIn ? Math.max(0, meta.notes - (have ?? 0)) : 0

  const add = async () => {
    setBusy(true)
    try {
      const r = await installModule(meta, content ?? (await meta.load()))
      if (!isIn) toast(`« ${meta.deckName} » ajouté : ${plural(r.added, 'carte', 'cartes')}`)
      else if (r.added || r.updated) {
        toast([r.added && plural(r.added, 'carte ajoutée', 'cartes ajoutées'), r.updated && plural(r.updated, 'carte corrigée', 'cartes corrigées')].filter(Boolean).join(', '))
      } else toast('Module déjà à jour')
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const study = async () => {
    const id = await moduleRootDeck(meta)
    if (id) navigate(`/study/${id}`)
  }

  const loadDetails = (open: boolean) => {
    if (open && !content) meta.load().then(setContent, (e) => toast(friendlyError(e)))
  }

  const headingId = `mod-${meta.id}`
  return (
    <article className="card module" aria-labelledby={headingId}>
      <div className="module-head">
        <h3 id={headingId}>{meta.title}</h3>
        <span className="chip">{meta.version}</span>
      </div>
      <p className="module-desc">{meta.description}</p>
      <p className="muted small module-meta">
        {plural(meta.cards, 'carte', 'cartes')} · {pace(meta.cards, perDay)}
      </p>

      <details className="module-details" onToggle={(e) => loadDetails((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>Programme et examen</summary>
        <dl className="module-exam">
          {meta.exam.map((x) => (
            <div key={x.label}>
              <dt>{x.label}</dt>
              <dd>{x.value}</dd>
            </div>
          ))}
        </dl>
        {content ? (
          <ol className="module-chapters">
            {content.chapters.map((c) => (
              <li key={c.title}>
                {c.title} <span className="muted small">({c.cards.length})</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted small">Chargement des chapitres…</p>
        )}
      </details>

      <div className="row module-actions">
        {isIn ? (
          <>
            <span className="pill-ok small module-status">
              <IconCheck />
              Ajouté
            </span>
            <span className="grow" />
            <button className="btn small" onClick={add} disabled={busy}>
              {busy ? 'Mise à jour…' : missing > 0 ? `Compléter (+${missing})` : 'Mettre à jour'}
            </button>
            <button className="btn small primary" onClick={study}>
              Étudier
            </button>
          </>
        ) : (
          <>
            <span className="grow" />
            <button className="btn small primary" onClick={add} disabled={busy || have === undefined} aria-label={`Ajouter ${meta.title}`}>
              {busy ? 'Ajout…' : 'Ajouter'}
            </button>
          </>
        )}
      </div>
    </article>
  )
}
