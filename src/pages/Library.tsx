import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { IconCheck } from '../components/icons'
import { askConfirm, toast } from '../components/ui'
import { getSettings } from '../db'
import { autoBackup } from '../lib/autobackup'
import { friendlyError } from '../lib/errors'
import { chaptersProgress, installModule, MASTERED_DAYS, moduleRootDeck, modulesProgress, removeModule, type Progress } from '../lib/library'
import { fold } from '../lib/search'
import { CATEGORIES, LEVELS, MODULES } from '../modules/catalog'
import type { ModuleCategory, ModuleContent, ModuleLevel, ModuleMeta } from '../modules/types'
import { navigate } from '../router'

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`
const levelLabel = (l: ModuleLevel) => LEVELS.find((x) => x.id === l)?.label ?? l

/** Durée indicative pour voir toutes les cartes au rythme des nouvelles cartes par jour. */
function pace(cards: number, perDay: number): string {
  if (perDay <= 0) return 'nouvelles cartes désactivées dans les Réglages'
  const days = Math.ceil(cards / perDay)
  const span = days < 14 ? plural(days, 'jour', 'jours') : `≈ ${plural(Math.round(days / 7), 'semaine', 'semaines')}`
  return `${span} à ${perDay} nouvelles cartes par jour`
}

type Owned = 'all' | 'mine' | 'new'

/** Texte de recherche d'un module (sans accents ni casse). */
const haystack = new Map(MODULES.map((m) => [m.id, fold(`${m.title} ${m.deckName} ${m.version} ${m.description}`)]))

export function Library() {
  const [category, setCategory] = useState<ModuleCategory | 'all'>('all')
  const [level, setLevel] = useState<ModuleLevel | 'all'>('all')
  const [owned, setOwned] = useState<Owned>('all')
  const [query, setQuery] = useState('')
  const settings = useLiveQuery(() => getSettings(), [])
  // Avancement de chaque module présent dans la collection, recalculé à chaque changement (ajout, révision, retrait).
  const progress = useLiveQuery(() => modulesProgress(MODULES.map((m) => m.id)), [])

  const mine = MODULES.filter((m) => progress?.has(m.id))
  const levels = LEVELS.filter((l) => MODULES.some((m) => m.level === l.id))
  const terms = fold(query).split(/\s+/).filter(Boolean)

  const visible = MODULES.filter(
    (m) =>
      (level === 'all' || m.level === level) &&
      (owned === 'all' || (owned === 'mine') === !!progress?.has(m.id)) &&
      terms.every((t) => haystack.get(m.id)!.includes(t)),
  )
  const shown = CATEGORIES.filter((c) => category === 'all' || c.id === category)
    .map((c) => ({ ...c, modules: visible.filter((m) => m.category === c.id) }))
    .filter((c) => c.modules.length > 0)

  const total = mine.reduce(
    (s, m) => {
      const p = progress!.get(m.id)!
      return { due: s.due + p.due, mastered: s.mastered + p.mastered }
    },
    { due: 0, mastered: 0 },
  )
  const filtered = category !== 'all' || level !== 'all' || owned !== 'all' || terms.length > 0
  const clear = () => {
    setCategory('all')
    setLevel('all')
    setOwned('all')
    setQuery('')
  }

  return (
    <>
      <div className="page-head">
        <h1>Modules</h1>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Des cartes prêtes à réviser, rédigées d'après les programmes officiels. Ajoutez un module entier ou seulement
        certains chapitres : il devient un paquet, avec un sous-paquet par chapitre, et ses cartes arrivent au rythme de
        vos nouvelles cartes quotidiennes.
      </p>

      {mine.length > 0 && (
        <p className="lib-summary">
          <strong>{plural(mine.length, 'module ajouté', 'modules ajoutés')}</strong>
          <span>{plural(total.due, 'carte à revoir', 'cartes à revoir')} aujourd'hui</span>
          <span>{plural(total.mastered, 'carte acquise', 'cartes acquises')}</span>
        </p>
      )}

      <div className="lib-tools">
        <div className="seg lib-owned" role="group" aria-label="Afficher">
          {(
            [
              ['all', `Tous (${MODULES.length})`],
              ['mine', `Mes modules (${mine.length})`],
              ['new', `À découvrir (${MODULES.length - mine.length})`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={owned === id ? 'on' : ''} aria-pressed={owned === id} onClick={() => setOwned(id)}>
              {label}
            </button>
          ))}
        </div>
        <input
          id="lib-search"
          type="search"
          className="lib-search"
          placeholder="Rechercher (AZ-104, réseau, Scrum…)"
          aria-label="Rechercher un module"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="chips scroll lib-filters" role="group" aria-label="Filtrer par catégorie">
        <button className={`chip${category === 'all' ? ' on' : ''}`} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
          Toutes catégories
        </button>
        {CATEGORIES.map((c) => {
          const n = MODULES.filter((m) => m.category === c.id).length
          if (!n) return null
          return (
            <button key={c.id} className={`chip${category === c.id ? ' on' : ''}`} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
              {c.label} <span className="chip-count">{n}</span>
            </button>
          )
        })}
      </div>
      {levels.length > 1 && (
        <div className="chips scroll lib-filters" role="group" aria-label="Filtrer par niveau">
          <button className={`chip${level === 'all' ? ' on' : ''}`} aria-pressed={level === 'all'} onClick={() => setLevel('all')}>
            Tous niveaux
          </button>
          {levels.map((l) => (
            <button key={l.id} className={`chip${level === l.id ? ' on' : ''}`} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <div className="empty">
          <h2>Aucun module ne correspond</h2>
          <p>{owned === 'mine' && mine.length === 0 ? "Vous n'avez encore ajouté aucun module." : 'Essayez une autre recherche ou un autre filtre.'}</p>
          {filtered && (
            <button className="btn" onClick={clear}>
              Effacer les filtres
            </button>
          )}
        </div>
      )}

      {shown.map((cat) => (
        <section key={cat.id} className="lib-cat" aria-labelledby={`cat-${cat.id}`}>
          <h2 id={`cat-${cat.id}`}>
            {cat.label} <span className="lib-cat-count">{cat.modules.length}</span>
          </h2>
          {cat.modules.map((m) => (
            <ModuleCard
              key={m.id}
              meta={m}
              progress={progress === undefined ? undefined : (progress.get(m.id) ?? null)}
              perDay={settings?.newPerDay ?? 20}
            />
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

function ProgressBar({ p, label }: { p: Progress; label: string }) {
  const seen = p.cards ? (p.seen / p.cards) * 100 : 0
  const mastered = p.cards ? (p.mastered / p.cards) * 100 : 0
  return (
    <div
      className="mod-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={p.cards}
      aria-valuenow={p.seen}
      aria-valuetext={`${p.seen} cartes vues sur ${p.cards}, dont ${p.mastered} acquises`}
    >
      <div className="seen" style={{ width: `${seen}%` }} />
      <div className="mastered" style={{ width: `${mastered}%` }} />
    </div>
  )
}

/** progress : undefined pendant le chargement, null si le module n'est pas dans la collection. */
function ModuleCard({ meta, progress, perDay }: { meta: ModuleMeta; progress: Progress | null | undefined; perDay: number }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [content, setContent] = useState<ModuleContent | null>(null)
  const isIn = !!progress
  const missing = isIn ? Math.max(0, meta.notes - progress.notes) : 0
  // Avancement par chapitre : seulement quand le programme est chargé (détails ouverts) et le module présent.
  const chapters = useLiveQuery(() => (content && isIn ? chaptersProgress(meta, content) : undefined), [content, isIn, progress])
  const partial = chapters ? chapters.filter((c) => c.notes > 0).length : null

  const getContent = async () => content ?? (await meta.load())

  const add = async (chapterIndexes?: number[], chapterTitle?: string) => {
    setBusy(chapterTitle ?? 'all')
    try {
      const r = await installModule(meta, await getContent(), { chapters: chapterIndexes })
      if (chapterTitle) toast(`Chapitre « ${chapterTitle} » ajouté : ${plural(r.added, 'carte', 'cartes')}`)
      else if (!isIn) toast(`« ${meta.deckName} » ajouté : ${plural(r.added, 'carte', 'cartes')}`)
      else if (r.added || r.updated) {
        toast([r.added && plural(r.added, 'carte ajoutée', 'cartes ajoutées'), r.updated && plural(r.updated, 'carte corrigée', 'cartes corrigées')].filter(Boolean).join(', '))
      } else toast('Module déjà à jour')
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  const study = async (deckId?: string | null) => {
    const id = deckId ?? (await moduleRootDeck(meta))
    if (id) navigate(`/study/${id}`)
  }

  const remove = async () => {
    const ok = await askConfirm({
      title: `Retirer « ${meta.deckName} » ?`,
      message:
        `Les ${plural(progress?.notes ?? 0, 'note', 'notes')} du module, leurs cartes et leur avancement seront supprimés, ` +
        'ainsi que ses paquets devenus vides. Une sauvegarde automatique est faite avant (Réglages → Sauvegardes automatiques).',
      okLabel: 'Retirer',
      danger: true,
    })
    if (!ok) return
    setBusy('remove')
    try {
      const saved = await autoBackup(`Avant retrait du module ${meta.deckName}`)
      const r = await removeModule(meta)
      toast(`Module retiré : ${plural(r.notes, 'note supprimée', 'notes supprimées')}${saved ? '' : ' (sauvegarde automatique impossible)'}`)
    } catch (e) {
      toast(friendlyError(e))
    } finally {
      setBusy(null)
    }
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
      {meta.highlight && <p className="module-highlight">{meta.highlight}</p>}
      <p className="module-desc">{meta.description}</p>
      <p className="muted small module-meta">
        <span className={`level level-${meta.level}`}>{levelLabel(meta.level)}</span> · {plural(meta.cards, 'carte', 'cartes')}
        {!isIn && <> · {pace(meta.cards, perDay)}</>}
      </p>

      {isIn && (
        <div className="module-progress">
          <ProgressBar p={progress} label={`Avancement de ${meta.title}`} />
          <p className="small muted">
            {progress.seen.toLocaleString('fr-FR')} / {plural(progress.cards, 'carte vue', 'cartes vues')} ·{' '}
            <span title={`En révision avec un intervalle d'au moins ${MASTERED_DAYS} jours`}>{plural(progress.mastered, 'acquise', 'acquises')}</span>
            {progress.due > 0 && <> · <strong className="due-today">{progress.due} à revoir aujourd'hui</strong></>}
          </p>
        </div>
      )}

      <details className="module-details" onToggle={(e) => loadDetails((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>Programme, chapitres et examen</summary>
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
            {content.chapters.map((c, i) => {
              const cp = chapters?.[i]
              const has = !!cp && cp.notes > 0
              return (
                <li key={c.title}>
                  <div className="chapter-line">
                    <span className="chapter-title">
                      {c.title} <span className="muted small">({c.cards.length})</span>
                    </span>
                    {has ? (
                      <button className="btn small ghost" onClick={() => study(cp.deckId)} aria-label={`Étudier le chapitre « ${c.title} »`}>
                        Étudier
                      </button>
                    ) : (
                      <button
                        className="btn small ghost"
                        onClick={() => add([i], c.title)}
                        disabled={busy !== null || progress === undefined}
                        aria-label={`Ajouter le chapitre « ${c.title} »`}
                      >
                        {busy === c.title ? 'Ajout…' : '+ Ajouter'}
                      </button>
                    )}
                  </div>
                  {has && <ProgressBar p={cp} label={`Avancement du chapitre « ${c.title} »`} />}
                </li>
              )
            })}
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
              {partial !== null && content && partial < content.chapters.length
                ? `Ajouté en partie (${partial}/${content.chapters.length} chapitres)`
                : 'Ajouté'}
            </span>
            <span className="grow" />
            <button className="btn small ghost danger" onClick={remove} disabled={busy !== null} aria-label={`Retirer ${meta.title}`}>
              {busy === 'remove' ? 'Retrait…' : 'Retirer'}
            </button>
            <button className="btn small" onClick={() => add()} disabled={busy !== null}>
              {busy === 'all' ? 'Mise à jour…' : missing > 0 ? `Compléter (+${missing})` : 'Mettre à jour'}
            </button>
            <button className="btn small primary" onClick={() => study()}>
              Étudier
            </button>
          </>
        ) : (
          <>
            <span className="grow" />
            <button className="btn small primary" onClick={() => add()} disabled={busy !== null || progress === undefined} aria-label={`Ajouter ${meta.title}`}>
              {busy === 'all' ? 'Ajout…' : 'Ajouter'}
            </button>
          </>
        )}
      </div>
    </article>
  )
}
