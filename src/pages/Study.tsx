import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { IconBack, IconUndo } from '../components/icons'
import { toast } from '../components/ui'
import { db, getSettings, saveSettings } from '../db'
import { buildQueue, LEARN_AHEAD_MS, makeReview, saveReview, undoReview, type AppliedReview } from '../lib/queue'
import { cardFaces } from '../lib/render'
import { prepareScheduler, previewAll, type Scheduler } from '../lib/scheduler'
import { compareAnswer, type Part } from '../lib/typed'
import type { Card, Note, Rating, Settings } from '../types'
import { navigate } from '../router'

const RATINGS: { r: Rating; label: string }[] = [
  { r: 1, label: 'À revoir' },
  { r: 2, label: 'Difficile' },
  { r: 3, label: 'Bien' },
  { r: 4, label: 'Facile' },
]
/** Distance (px) de balayage horizontal qui valide une réponse. */
const SWIPE_THRESHOLD = 100

interface HistoryItem {
  applied: AppliedReview
  queueBefore: string[]
}

function Diff({ parts }: { parts: Part[] }) {
  return (
    <div className="diff">
      {parts.length === 0 ? <span className="muted">(vide)</span> : parts.map((p, i) => <span key={i} className={p.kind === 'same' ? '' : p.kind}>{p.text}</span>)}
    </div>
  )
}

export function Study({ deckId }: { deckId: string | null }) {
  const [phase, setPhase] = useState<'loading' | 'study' | 'done'>('loading')
  const [queue, setQueue] = useState<string[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [scheduler, setScheduler] = useState<Scheduler | null>(null)
  const [deckName, setDeckName] = useState('Tous les paquets')
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [typedMode, setTypedMode] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [tally, setTally] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })
  const [total, setTotal] = useState(0)
  const [dx, setDx] = useState(0)
  const [, setTick] = useState(0)
  // Attente : quand il ne reste que des cartes en apprentissage pas encore dues.
  const [skipWait, setSkipWait] = useState(false)
  const [clock, setClock] = useState(() => Date.now())

  const cards = useRef(new Map<string, Card>())
  const notes = useRef(new Map<string, Note>())
  const shownAt = useRef(Date.now())
  const busy = useRef(false)
  // File d'écritures en base : l'interface avance tout de suite, les écritures restent ordonnées.
  const writes = useRef<Promise<void>>(Promise.resolve())
  const drag = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const swiped = useRef(false)
  const typedRef = useRef<HTMLTextAreaElement>(null)

  // Chargement initial : réglages, file du jour, cartes et notes correspondantes.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const s = await getSettings()
      const sched = await prepareScheduler(s)
      const q = await buildQueue(deckId, s)
      const cs = (await db.cards.bulkGet(q.ids)).filter((c): c is Card => !!c)
      const ns = (await db.notes.bulkGet([...new Set(cs.map((c) => c.noteId))])).filter((n): n is Note => !!n)
      if (deckId) setDeckName((await db.decks.get(deckId))?.name ?? 'Paquet')
      if (!alive) return
      cs.forEach((c) => cards.current.set(c.id, c))
      ns.forEach((n) => notes.current.set(n.id, n))
      const ids = q.ids.filter((id) => notes.current.has(cards.current.get(id)!.noteId))
      setSettings(s)
      setScheduler(sched)
      setTypedMode(s.typedAnswer)
      setQueue(ids)
      setTotal(ids.length)
      shownAt.current = Date.now()
      setPhase(ids.length ? 'study' : 'done')
    })()
    return () => {
      alive = false
    }
  }, [deckId])

  const card = queue.length ? cards.current.get(queue[0]) : undefined
  const note = card ? notes.current.get(card.noteId) : undefined
  const faces = useMemo(() => (card && note ? cardFaces(note, card.ord) : null), [card, note])
  // Échéance la plus proche si TOUTES les cartes restantes sont en (ré)apprentissage et pas encore dues (0 = pas d'attente).
  const waitUntil = useMemo(() => {
    if (phase !== 'study' || skipWait || queue.length === 0) return 0
    let min = Infinity
    for (const id of queue) {
      const c = cards.current.get(id)
      if (!c || (c.state !== 1 && c.state !== 3) || c.due <= clock) return 0
      min = Math.min(min, c.due)
    }
    return min
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, skipWait, queue, clock])

  useEffect(() => {
    if (!waitUntil) {
      shownAt.current = Date.now()
      return
    }
    const t = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(t)
  }, [waitUntil])

  // Intervalles calculés une seule fois par carte affichée : ce qui est montré = ce qui est appliqué.
  const previews = useMemo(() => (card && scheduler ? previewAll(card, Date.now(), scheduler) : null), [card, scheduler, waitUntil])
  const comparison = useMemo(() => (revealed && typedMode && faces ? compareAnswer(typed, faces.expected) : null), [revealed, typedMode, faces, typed])

  const counts = useMemo(() => {
    let n = 0, l = 0, r = 0
    for (const id of queue) {
      const st = cards.current.get(id)?.state
      if (st === 0) n++
      else if (st === 2) r++
      else l++
    }
    return { n, l, r }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  const reveal = useCallback(() => {
    setRevealed(true)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }, [])

  const next = (q: string[]) => {
    setQueue(q)
    setRevealed(false)
    setTyped('')
    setDx(0)
    shownAt.current = Date.now()
    setSkipWait(false)
    setClock(Date.now())
    if (q.length === 0) setPhase('done')
  }

  const rate = useCallback(
    (r: Rating) => {
      if (!card || !previews || busy.current) return
      const out = previews[r]
      const applied = makeReview(card, r, out, Date.now() - shownAt.current)
      cards.current.set(card.id, out.card)
      const rest = queue.slice(1)
      // Carte en (ré)apprentissage proche : on la représente plus tard dans la séance.
      const soon = (out.card.state === 1 || out.card.state === 3) && out.card.due <= Date.now() + LEARN_AHEAD_MS
      if (soon) rest.splice(Math.min(rest.length, out.delayMs < 120_000 ? 2 : 5), 0, card.id)
      setHistory((h) => [...h, { applied, queueBefore: queue }])
      setTally((t) => ({ ...t, [r]: t[r] + 1 }))
      next(rest)
      setTick((t) => t + 1)
      // Écriture en arrière-plan, dans l'ordre des réponses.
      writes.current = writes.current
        .then(() => saveReview(applied, out))
        .catch(() => toast("Échec de l'enregistrement de la réponse"))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, previews, queue],
  )

  const undo = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last || busy.current) return
    busy.current = true
    try {
      await writes.current // l'écriture de cette réponse doit être terminée avant de l'annuler
      await undoReview(last.applied)
      cards.current.set(last.applied.before.id, last.applied.before)
      setHistory((h) => h.slice(0, -1))
      setTally((t) => ({ ...t, [last.applied.log.rating]: Math.max(0, t[last.applied.log.rating] - 1) }))
      setPhase('study')
      next(last.queueBefore)
    } finally {
      busy.current = false
    }
  }, [history])

  const toggleTyped = async () => {
    const v = !typedMode
    setTypedMode(v)
    await saveSettings({ typedAnswer: v })
  }

  // Raccourcis clavier (PC).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'study' || waitUntil || e.ctrlKey || e.metaKey || e.altKey) return
      const inField = (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === 'Escape') return navigate('/')
      if (inField && !(e.key === 'Enter' && !e.shiftKey)) return
      if (!revealed) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          reveal()
        }
      } else if (['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating)
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        rate(comparison ? comparison.suggested : 3)
      }
      if (e.key === 'z' || e.key === 'u' || e.key === 'Backspace') {
        if (!inField) {
          e.preventDefault()
          void undo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, waitUntil, revealed, reveal, rate, undo, comparison])

  useEffect(() => {
    if (phase === 'study' && typedMode && !revealed) typedRef.current?.focus()
  }, [phase, typedMode, revealed, card])

  // --- Balayage tactile : gauche = À revoir, droite = Bien (après avoir révélé la réponse) ---
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    drag.current = { x: e.clientX, y: e.clientY, active: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const mx = e.clientX - d.x
    const my = e.clientY - d.y
    if (!d.active && Math.abs(mx) > 14 && Math.abs(mx) > Math.abs(my) * 1.5) {
      d.active = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    if (d.active && revealed) setDx(mx)
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    swiped.current = true
    setTimeout(() => (swiped.current = false), 50)
    if (revealed && Math.abs(dx) > SWIPE_THRESHOLD) void rate(dx < 0 ? 1 : 3)
    else setDx(0)
  }

  if (phase === 'loading' || !settings) return <div className="study"><p className="muted">Chargement…</p></div>

  if (phase === 'done') {
    const reviewed = tally[1] + tally[2] + tally[3] + tally[4]
    const success = reviewed ? Math.round(((tally[2] + tally[3] + tally[4]) / reviewed) * 100) : 0
    return (
      <div className="study">
        <div className="study-top">
          <button className="btn ghost icon" onClick={() => navigate('/')} aria-label="Retour"><IconBack /></button>
          <strong className="grow">{deckName}</strong>
          {history.length > 0 && <button className="btn ghost small" onClick={undo}><IconUndo />Annuler</button>}
        </div>
        <div className="empty card" style={{ margin: 'auto 0' }}>
          <h2>{reviewed ? 'Séance terminée 🎉' : 'Rien à étudier pour le moment'}</h2>
          {reviewed ? (
            <>
              <p>{reviewed} carte{reviewed > 1 ? 's' : ''} révisée{reviewed > 1 ? 's' : ''} · {success} % de réussite</p>
              <div className="chips" style={{ justifyContent: 'center', marginBottom: 16 }}>
                {RATINGS.map(({ r, label }) => <span className="chip" key={r}>{label} : {tally[r]}</span>)}
              </div>
            </>
          ) : (
            <p>Aucune carte n'est due, ou les limites du jour sont atteintes (modifiables dans les Réglages).</p>
          )}
          <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => navigate('/')}>Retour aux paquets</button>
            <button className="btn" onClick={() => navigate('/stats')}>Statistiques</button>
          </div>
        </div>
      </div>
    )
  }

  if (waitUntil) {
    const secs = Math.max(0, Math.ceil((waitUntil - clock) / 1000))
    const mm = String(Math.floor(secs / 60)).padStart(2, '0')
    const ss = String(secs % 60).padStart(2, '0')
    return (
      <div className="study">
        <div className="study-top">
          <button className="btn ghost icon" onClick={() => navigate('/')} aria-label="Quitter la séance"><IconBack /></button>
          <strong className="grow">{deckName}</strong>
          <button className="btn ghost icon small" onClick={undo} disabled={history.length === 0} aria-label="Annuler la dernière réponse"><IconUndo /></button>
        </div>
        <div className="empty card anim-in" style={{ margin: 'auto 0' }} role="status">
          <h2>Prochaine carte dans {mm}:{ss}</h2>
          <p>Il ne reste que des cartes en cours d'apprentissage. Faites une pause, ou continuez tout de suite.</p>
          <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => setSkipWait(true)}>Continuer maintenant</button>
            <button className="btn" onClick={() => navigate('/')}>Terminer la séance</button>
          </div>
        </div>
      </div>
    )
  }

  if (!card || !note || !faces || !previews) return null

  const progress = total ? Math.min(100, Math.round(((total - queue.length + 0) / total) * 100)) : 0
  const tilt = Math.max(-1, Math.min(1, dx / 220))
  const cardStyle = dx ? { transform: `translateX(${dx}px) rotate(${tilt * 4}deg)`, borderColor: dx < 0 ? 'var(--again)' : 'var(--good)' } : undefined

  return (
    <div className="study">
      <div className="study-top">
        <button className="btn ghost icon" onClick={() => navigate('/')} aria-label="Quitter la séance"><IconBack /></button>
        <div className="grow">
          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deckName}</div>
          <div className="study-counts" aria-label="Cartes restantes">
            <span className="n" title="Nouvelles">{counts.n}</span>
            <span className="l" title="En apprentissage">{counts.l}</span>
            <span className="r" title="À revoir">{counts.r}</span>
          </div>
        </div>
        <button className={`btn small${typedMode ? ' primary' : ''}`} onClick={toggleTyped} aria-pressed={typedMode} title="Taper la réponse">Taper</button>
        <button className="btn ghost icon small" onClick={undo} disabled={history.length === 0} aria-label="Annuler la dernière réponse"><IconUndo /></button>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress}%` }} /></div>

      <div
        className="study-card-wrap"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <span className="swipe-hint l" style={{ opacity: dx < -30 ? Math.min(1, -dx / SWIPE_THRESHOLD) : 0 }}>À revoir</span>
        <span className="swipe-hint r" style={{ opacity: dx > 30 ? Math.min(1, dx / SWIPE_THRESHOLD) : 0 }}>Bien</span>
        <div
          className={`study-card${dx ? ' dragging' : ''}`}
          style={cardStyle}
          onClick={() => { if (!revealed && !typedMode && !swiped.current) reveal() }}
        >
          {revealed && faces.backIncludesFront ? (
            <div className="face"><Markdown md={faces.back} /></div>
          ) : (
            <>
              <div className="face"><Markdown md={faces.front} /></div>
              {revealed && (
                <>
                  <hr />
                  <div className="face"><Markdown md={faces.back} /></div>
                </>
              )}
            </>
          )}
          {comparison && (
            <div className="typed-box" style={{ fontSize: '1rem' }}>
              <div className="verdict">
                <span className={comparison.verdict}>
                  {comparison.verdict === 'exact' && '✓ Exact'}
                  {comparison.verdict === 'correct' && '✓ Correct (à la casse/accents près)'}
                  {comparison.verdict === 'close' && '≈ Presque'}
                  {comparison.verdict === 'wrong' && '✗ Incorrect'}
                </span>
              </div>
              {comparison.verdict !== 'exact' && (
                <>
                  <div className="muted small">Votre réponse</div>
                  <Diff parts={comparison.typedParts} />
                  <div className="muted small">Attendu</div>
                  <Diff parts={comparison.expectedParts} />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="study-actions">
        {!revealed ? (
          <>
            {typedMode && (
              <textarea
                ref={typedRef}
                className="code"
                style={{ minHeight: 56, marginBottom: 10 }}
                rows={2}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Tapez votre réponse puis Entrée…"
                aria-label="Votre réponse"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            )}
            <button className="btn primary reveal-btn" onClick={reveal}>
              {typedMode ? 'Vérifier' : 'Afficher la réponse'} <span className="kbd">Espace</span>
            </button>
          </>
        ) : (
          <div className="rate-grid" role="group" aria-label="Noter la réponse">
            {RATINGS.map(({ r, label }) => (
              <button key={r} className={`rate r${r}${comparison?.suggested === r ? ' suggested' : ''}`} onClick={() => rate(r)}>
                <span>{label}</span>
                <small>{previews[r].label}</small>
                <span className="kbd">{r}</span>
              </button>
            ))}
          </div>
        )}
        <div className="shortcuts">Espace : révéler / « Bien » · 1-4 : noter · Z : annuler · Échap : quitter</div>
      </div>
    </div>
  )
}
