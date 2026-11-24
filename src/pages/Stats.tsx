import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, getSettings } from '../db'
import { dayStart, deckCounts } from '../lib/queue'
import { activityByDay, computeStreak, dayKey, forecast, heatLevel, successRate } from '../lib/stats'

const DAY = 86_400_000
const WEEKS = 26
const CELL = 12
const GAP = 3
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS = ['L', '', 'M', '', 'V', '', 'D']

/** Couleurs des 5 niveaux : du fond neutre à l'accent plein. */
const LEVEL_FILL = [
  'var(--surface-2)',
  'color-mix(in srgb, var(--accent) 30%, var(--surface-2))',
  'color-mix(in srgb, var(--accent) 55%, var(--surface-2))',
  'color-mix(in srgb, var(--accent) 80%, var(--surface-2))',
  'var(--accent)',
]

export function Stats() {
  const data = useLiveQuery(async () => {
    const now = Date.now()
    const [reviews, cards, counts] = await Promise.all([db.reviews.toArray(), db.cards.toArray(), getSettings().then((s) => deckCounts(s, now))])
    let nNew = 0, nLearn = 0, nDue = 0
    const decks = await db.decks.toArray()
    // Les compteurs des racines incluent leurs sous-paquets : on ne somme que les racines.
    for (const d of decks.filter((d) => !d.parentId || !decks.some((p) => p.id === d.parentId))) {
      const c = counts.get(d.id)
      if (c) { nNew += c.new; nLearn += c.learn; nDue += c.review }
    }
    return { now, reviews, cards, nNew, nLearn, nDue }
  }, [])

  const derived = useMemo(() => {
    if (!data) return null
    const { now, reviews, cards } = data
    const activity = activityByDay(reviews)
    const streak = computeStreak(activity, now)
    const rate30 = successRate(reviews, now - 30 * DAY)
    const fc = forecast(cards, now, 30)
    const today = dayStart(now)

    // Calendrier : colonnes = semaines (lundi→dimanche), se terminant par la semaine en cours.
    const todayDow = (new Date(today).getDay() + 6) % 7 // 0 = lundi
    const startWeek = today - todayDow * DAY - (WEEKS - 1) * 7 * DAY
    const days: { key: string; count: number; col: number; row: number; future: boolean }[] = []
    let max = 0
    for (let w = 0; w < WEEKS; w++) {
      for (let r = 0; r < 7; r++) {
        const ts = startWeek + (w * 7 + r) * DAY + 12 * 3_600_000
        const key = dayKey(ts)
        const count = activity.get(key) ?? 0
        max = Math.max(max, count)
        days.push({ key, count, col: w, row: r, future: ts > now + DAY })
      }
    }
    const monthLabels: { col: number; label: string }[] = []
    let lastMonth = -1
    for (let w = 0; w < WEEKS; w++) {
      const m = new Date(startWeek + w * 7 * DAY + 12 * 3_600_000).getMonth()
      if (m !== lastMonth) { monthLabels.push({ col: w, label: MONTHS[m] }); lastMonth = m }
    }
    const totalDays = activity.size
    return { activity, streak, rate30, fc, days, max, monthLabels, totalDays, reviewsToday: activity.get(dayKey(now)) ?? 0 }
  }, [data])

  if (!data || !derived) return null
  const { streak, rate30, fc, days, max, monthLabels } = derived
  const fcMax = Math.max(1, ...fc)
  const BW = 14, BG = 4, BH = 110
  const total7 = fc.slice(0, 7).reduce((a, b) => a + b, 0)
  const total30 = fc.reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="page-head"><h1>Statistiques</h1></div>

      {data.reviews.length === 0 && (
        <div className="card panel anim-in" role="status">
          <h2>Pas encore de statistiques</h2>
          <p className="muted" style={{ margin: 0 }}>Révisez quelques cartes : votre série de jours, votre taux de réussite, le calendrier d'activité et la prévision des révisions apparaîtront ici.</p>
        </div>
      )}

      <div className="kpis">
        <div className="card kpi">
          <div className="v" style={{ color: 'var(--due)' }}>{data.nDue + data.nLearn}</div>
          <div className="t">à revoir aujourd'hui{data.nNew > 0 ? ` (+ ${data.nNew} nouvelle${data.nNew > 1 ? 's' : ''})` : ''}</div>
        </div>
        <div className="card kpi">
          <div className="v">{streak.current}<span className="muted small"> j</span></div>
          <div className="t">série en cours (record : {streak.best} j)</div>
        </div>
        <div className="card kpi">
          <div className="v">{rate30.rate === null ? '—' : `${Math.round(rate30.rate * 100)} %`}</div>
          <div className="t">réussite sur 30 jours ({rate30.count} rév.)</div>
        </div>
        <div className="card kpi">
          <div className="v">{data.cards.length}</div>
          <div className="t">cartes au total · {derived.reviewsToday} révisées aujourd'hui</div>
        </div>
      </div>

      <section className="card panel">
        <h2>Calendrier d'activité</h2>
        <svg className="heat" viewBox={`0 0 ${20 + WEEKS * (CELL + GAP)} ${18 + 7 * (CELL + GAP)}`} role="img" aria-label="Calendrier d'activité sur 26 semaines">
          {monthLabels.map((m) => (
            <text key={m.col} x={20 + m.col * (CELL + GAP)} y={10} fontSize="9" fill="var(--muted)">{m.label}</text>
          ))}
          {WEEKDAYS.map((d, i) => d && <text key={i} x={0} y={18 + i * (CELL + GAP) + 10} fontSize="9" fill="var(--muted)">{d}</text>)}
          {days.filter((d) => !d.future).map((d) => (
            <rect key={d.key} x={20 + d.col * (CELL + GAP)} y={16 + d.row * (CELL + GAP)} width={CELL} height={CELL} rx={3} fill={LEVEL_FILL[heatLevel(d.count, max)]}>
              <title>{`${d.key} : ${d.count} révision${d.count > 1 ? 's' : ''}`}</title>
            </rect>
          ))}
        </svg>
        <div className="legend">
          moins {LEVEL_FILL.map((f, i) => <i key={i} style={{ background: f }} />)} plus
        </div>
      </section>

      <section className="card panel">
        <h2>Prévision des révisions (30 jours)</h2>
        <p className="muted small" style={{ margin: '-6px 0 10px' }}>{total7} cartes dans les 7 prochains jours · {total30} dans les 30 prochains.</p>
        <svg className="bars" viewBox={`0 0 ${fc.length * (BW + BG)} ${BH + 34}`} role="img" aria-label="Prévision des révisions">
          {fc.map((n, i) => {
            const h = Math.round((n / fcMax) * BH)
            const x = i * (BW + BG)
            return (
              <g key={i}>
                <rect x={x} y={BH - h + 14} width={BW} height={Math.max(h, n ? 2 : 0)} rx={3} fill={i === 0 ? 'var(--due)' : 'var(--accent)'}>
                  <title>{`${i === 0 ? "Aujourd'hui" : `Dans ${i} j`} : ${n} carte${n > 1 ? 's' : ''}`}</title>
                </rect>
                {n > 0 && <text x={x + BW / 2} y={BH - h + 10} textAnchor="middle" fontSize="8" fill="var(--muted)">{n}</text>}
                {(i === 0 || i % 5 === 0) && <text x={x + BW / 2} y={BH + 28} textAnchor="middle" fontSize="9" fill="var(--muted)">{i === 0 ? 'auj.' : `+${i}`}</text>}
              </g>
            )
          })}
        </svg>
      </section>
    </>
  )
}
