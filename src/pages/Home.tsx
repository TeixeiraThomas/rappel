import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { BackupReminder } from '../components/BackupReminder'
import { IconChevron, IconMore, IconPlus } from '../components/icons'
import { askConfirm, askText, showMenu, toast } from '../components/ui'
import { db, getSettings } from '../db'
import { buildTree, createDeck, deleteDeck, flattenTree, moveDeck, renameDeck, type DeckNode } from '../lib/decks'
import { deckCounts } from '../lib/queue'
import { href, navigate } from '../router'

const COLLAPSED_KEY = 'rappel.collapsed'

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

export function Home() {
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const counts = useLiveQuery(async () => deckCounts(await getSettings()), [])
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)

  const tree = useMemo(() => buildTree(decks ?? []), [decks])

  // Liste visible : on saute les descendants des paquets repliés.
  const visible = useMemo(() => {
    const out: DeckNode[] = []
    const walk = (nodes: DeckNode[]) =>
      nodes.forEach((n) => {
        out.push(n)
        if (!collapsed.has(n.deck.id)) walk(n.children)
      })
    walk(tree)
    return out
  }, [tree, collapsed])

  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
    } catch {
      /* stockage indisponible : le repli n'est simplement pas mémorisé */
    }
  }

  const newDeck = async (parentId: string | null = null) => {
    const name = await askText({ title: parentId ? 'Nouveau sous-paquet' : 'Nouveau paquet', label: 'Nom', okLabel: 'Créer' })
    if (!name) return
    try {
      await createDeck(name, parentId)
      if (parentId && collapsed.has(parentId)) toggle(parentId)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const menu = (node: DeckNode) => {
    const all = flattenTree(tree)
    showMenu(node.path, [
      { label: 'Étudier', onClick: () => navigate(`/study/${node.deck.id}`) },
      { label: 'Ajouter une carte', onClick: () => navigate(`/new?deck=${node.deck.id}`) },
      { label: 'Parcourir les cartes', onClick: () => navigate(`/browse?q=${encodeURIComponent(`deck:"${node.path}"`)}`) },
      { label: 'Nouveau sous-paquet', onClick: () => newDeck(node.deck.id) },
      {
        label: 'Renommer',
        onClick: async () => {
          const name = await askText({ title: 'Renommer le paquet', value: node.deck.name, okLabel: 'Renommer' })
          if (name) await renameDeck(node.deck.id, name).catch((e) => toast((e as Error).message))
        },
      },
      {
        label: 'Déplacer…',
        onClick: () => {
          // Destinations possibles : racine + tout paquet qui n'est pas dans la branche déplacée.
          const forbidden = new Set(flattenTree([node]).map((n) => n.deck.id))
          showMenu('Déplacer vers…', [
            { label: '(Racine)', onClick: () => moveDeck(node.deck.id, null) },
            ...all
              .filter((n) => !forbidden.has(n.deck.id))
              .map((n) => ({ label: n.path, onClick: () => moveDeck(node.deck.id, n.deck.id).catch((e) => toast((e as Error).message)) })),
          ])
        },
      },
      {
        label: 'Supprimer',
        danger: true,
        onClick: async () => {
          const ok = await askConfirm({
            title: 'Supprimer ce paquet ?',
            message: `« ${node.path} », ses sous-paquets et toutes leurs cartes seront définitivement supprimés.`,
            okLabel: 'Supprimer',
            danger: true,
          })
          if (ok) {
            await deleteDeck(node.deck.id)
            toast('Paquet supprimé')
          }
        },
      },
    ])
  }

  if (!decks) return null

  // Rien à étudier : aucun compteur n'est non nul (les racines incluent déjà leurs sous-paquets).
  const nothingDue = !!counts && decks.length > 0 && [...counts.values()].every((c) => c.new + c.learn + c.review === 0)

  return (
    <>
      <div className="page-head">
        <h1>Paquets</h1>
        <button className="btn small" onClick={() => newDeck()}><IconPlus />Paquet</button>
      </div>

      <BackupReminder />

      {decks.length === 0 ? (
        <div className="empty card">
          <h2>Bienvenue dans Rappel</h2>
          <p>Créez votre premier paquet pour commencer à ajouter des cartes, ou importez un fichier CSV / une sauvegarde dans les Réglages.</p>
          <button className="btn primary" onClick={() => newDeck()}><IconPlus />Créer un paquet</button>
        </div>
      ) : (
        <>
          <div className="card">
            {visible.map((node) => {
              const c = counts?.get(node.deck.id)
              const hasChildren = node.children.length > 0
              return (
                <div className="deck-row" key={node.deck.id} style={{ paddingLeft: 8 + node.depth * 18 }}>
                  <button
                    className={`twisty${hasChildren ? '' : ' hidden'}${collapsed.has(node.deck.id) ? '' : ' open'}`}
                    onClick={() => toggle(node.deck.id)}
                    aria-label={collapsed.has(node.deck.id) ? 'Déplier' : 'Replier'}
                  >
                    <IconChevron />
                  </button>
                  <button className="deck-main" onClick={() => navigate(`/study/${node.deck.id}`)} aria-label={`Étudier ${node.path}`}>
                    <span className="deck-name">{node.deck.name}</span>
                  </button>
                  <span className="deck-counts" role="group" aria-label={`À étudier : ${c?.new ?? 0} nouvelles, ${c?.learn ?? 0} en apprentissage, ${c?.review ?? 0} à revoir`}>
                    <span className={`badge new${c?.new ? '' : ' zero'}`} aria-hidden="true">{c?.new ?? 0}</span>
                    <span className={`badge learn${c?.learn ? '' : ' zero'}`} aria-hidden="true">{c?.learn ?? 0}</span>
                    <span className={`badge due${c?.review ? '' : ' zero'}`} aria-hidden="true">{c?.review ?? 0}</span>
                  </span>
                  <button className="btn ghost icon small" onClick={() => menu(node)} aria-label={`Options de ${node.deck.name}`}><IconMore /></button>
                </div>
              )
            })}
          </div>
          <p className="muted small" style={{ textAlign: 'center' }}>
            <span style={{ color: 'var(--new)' }}>● nouvelles</span> · <span style={{ color: 'var(--learn)' }}>● en apprentissage</span> ·{' '}
            <span style={{ color: 'var(--due)' }}>● à revoir</span>
          </p>
          {nothingDue && (
            <p className="anim-in" style={{ textAlign: 'center', margin: '16px 0 4px' }} role="status">
              <strong>Rien à étudier pour le moment 🎉</strong>
              <br />
              <span className="muted small">Revenez plus tard, ou ajoutez de nouvelles cartes.</span>
            </p>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className={`btn${nothingDue ? '' : ' primary'}`} onClick={() => navigate('/study/all')}>Tout étudier</button>
          </div>
          <a className="fab" href={href('/new')} aria-label="Ajouter une carte"><IconPlus /></a>
        </>
      )}
    </>
  )
}
