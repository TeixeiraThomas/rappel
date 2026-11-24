import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { IconBack } from '../components/icons'
import { askConfirm, toast } from '../components/ui'
import { db } from '../db'
import { clozeNumbers } from '../lib/cloze'
import { buildTree, flattenTree } from '../lib/decks'
import { addImage } from '../lib/media'
import { allTags, createNote, deleteNote, ordsForNote, updateNote, validateNote } from '../lib/notes'
import { cardFaces } from '../lib/render'
import type { Note, NoteType } from '../types'
import { back, navigate } from '../router'

const LAST_KEY = 'rappel.lastEditor'
const TYPES: { id: NoteType; label: string }[] = [
  { id: 'basic', label: 'Recto / verso' },
  { id: 'reversed', label: '+ inverse' },
  { id: 'cloze', label: 'Texte à trous' },
]

function loadLast(): { deckId?: string; type?: NoteType } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}')
  } catch {
    return {}
  }
}

type Field = 'front' | 'back'

export function NoteEditor({ noteId, initialDeck }: { noteId: string | null; initialDeck: string | null }) {
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const tagList = useLiveQuery(() => allTags(), [])
  const existing = useLiveQuery(() => (noteId ? db.notes.get(noteId) : undefined), [noteId])

  const [deckId, setDeckId] = useState('')
  const [type, setType] = useState<NoteType>('basic')
  const [front, setFront] = useState('')
  const [back_, setBack] = useState('')
  const [tags, setTags] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [loaded, setLoaded] = useState(!noteId)
  const frontRef = useRef<HTMLTextAreaElement>(null)
  const backRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const targetField = useRef<Field>('front')

  const flat = useMemo(() => flattenTree(buildTree(decks ?? [])), [decks])

  // Initialisation : note existante, ou derniers choix / paquet demandé.
  useEffect(() => {
    if (noteId) {
      if (existing && !loaded) {
        setDeckId(existing.deckId)
        setType(existing.type)
        setFront(existing.front)
        setBack(existing.back)
        setTags(existing.tags.join(' '))
        setLoaded(true)
      }
    } else if (decks && !deckId) {
      const last = loadLast()
      const wanted = initialDeck ?? last.deckId
      setDeckId(decks.find((d) => d.id === wanted)?.id ?? decks[0]?.id ?? '')
      if (last.type) setType(last.type)
    }
  }, [noteId, existing, decks, loaded, deckId, initialDeck])

  if (!decks) return null
  if (noteId && existing === undefined && !loaded) return <p className="muted">Chargement…</p>
  if (decks.length === 0) {
    return (
      <div className="empty card">
        <h2>Aucun paquet</h2>
        <p>Créez d'abord un paquet pour y ranger vos cartes.</p>
        <button className="btn primary" onClick={() => navigate('/')}>Aller aux paquets</button>
      </div>
    )
  }

  const setField = (f: Field, v: string) => (f === 'front' ? setFront(v) : setBack(v))
  const refOf = (f: Field) => (f === 'front' ? frontRef : backRef)
  const valueOf = (f: Field) => (f === 'front' ? front : back_)

  /** Entoure la sélection (ou insère un modèle) dans le champ actif. */
  const wrap = (f: Field, before: string, after: string, placeholder = '') => {
    const el = refOf(f).current
    const v = valueOf(f)
    const s = el?.selectionStart ?? v.length
    const e = el?.selectionEnd ?? v.length
    const sel = v.slice(s, e) || placeholder
    setField(f, v.slice(0, s) + before + sel + after + v.slice(e))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(s + before.length, s + before.length + sel.length)
    })
  }

  /** Crée un trou : numéro suivant, ou le même numéro avec « same ». */
  const addCloze = (same = false) => {
    const nums = clozeNumbers(front)
    const n = nums.length ? (same ? nums[nums.length - 1] : nums[nums.length - 1] + 1) : 1
    wrap('front', `{{c${n}::`, '}}', 'réponse')
  }

  const insertImage = async (file: File, f: Field) => {
    try {
      const md = await addImage(file)
      wrap(f, md, '')
      toast('Image ajoutée')
    } catch {
      toast("Impossible d'ajouter l'image")
    }
  }

  const onPaste = (e: React.ClipboardEvent, f: Field) => {
    const file = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'))
    if (file) {
      e.preventDefault()
      void insertImage(file, f)
    }
  }

  const error = validateNote(type, front, back_)
  const nbCards = ordsForNote(type, front).length

  const save = async (another: boolean) => {
    if (error) return toast(error)
    try {
      if (noteId) {
        await updateNote(noteId, { deckId, type, front, back: back_, tags })
        toast('Carte enregistrée')
        back('/browse')
      } else {
        await createNote({ deckId, type, front, back: back_, tags })
        try {
          localStorage.setItem(LAST_KEY, JSON.stringify({ deckId, type }))
        } catch { /* sans importance */ }
        toast(nbCards > 1 ? `${nbCards} cartes créées` : 'Carte créée')
        if (another) {
          setFront('')
          setBack('')
          frontRef.current?.focus()
        } else back('/')
      }
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const remove = async () => {
    const ok = await askConfirm({ title: 'Supprimer cette carte ?', message: 'La note et ses cartes seront supprimées.', okLabel: 'Supprimer', danger: true })
    if (ok && noteId) {
      await deleteNote(noteId)
      toast('Carte supprimée')
      back('/browse')
    }
  }

  const previewNote: Note = { id: 'p', deckId, type, front, back: back_, tags: [], created: 0, updated: 0 }
  const frontLabel = type === 'cloze' ? 'Texte (avec trous)' : 'Recto'
  const backLabel = type === 'cloze' ? 'Extra (facultatif, affiché avec la réponse)' : 'Verso'

  const toolbar = (f: Field) => (
    <div className="toolbar" role="toolbar" aria-label="Mise en forme">
      <button type="button" onClick={() => wrap(f, '**', '**', 'gras')} aria-label="Gras"><b>G</b></button>
      <button type="button" onClick={() => wrap(f, '*', '*', 'italique')} aria-label="Italique"><i>I</i></button>
      <button type="button" onClick={() => wrap(f, '`', '`', 'commande')} aria-label="Code en ligne">{'</>'}</button>
      <button type="button" onClick={() => wrap(f, '\n```\n', '\n```\n', 'show ip route')} aria-label="Bloc de code">Bloc</button>
      <button type="button" onClick={() => wrap(f, '\n- ', '', 'élément')} aria-label="Liste">Liste</button>
      <button type="button" onClick={() => { targetField.current = f; fileRef.current?.click() }} aria-label="Image">Image</button>
      {type === 'cloze' && f === 'front' && (
        <>
          <button type="button" onClick={() => addCloze(false)}>{'{{ }} Trou'}</button>
          <button type="button" onClick={() => addCloze(true)} title="Même numéro que le dernier trou">Trou (même n°)</button>
        </>
      )}
    </div>
  )

  return (
    <>
      <div className="page-head">
        <button className="btn ghost icon" onClick={() => back('/')} aria-label="Retour"><IconBack /></button>
        <h1>{noteId ? 'Modifier la carte' : 'Nouvelle carte'}</h1>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void insertImage(f, targetField.current); e.target.value = '' }} />

      <label className="field">
        <span className="lbl">Paquet</span>
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
          {flat.map((n) => <option key={n.deck.id} value={n.deck.id}>{n.path}</option>)}
        </select>
      </label>

      <div className="field">
        <span className="lbl muted small" style={{ display: 'block', marginBottom: 6 }}>Type de carte</span>
        <div className="seg" role="tablist">
          {TYPES.map((t) => (
            <button key={t.id} role="tab" aria-selected={type === t.id} className={type === t.id ? 'on' : ''} onClick={() => setType(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="lbl muted small" style={{ display: 'block', marginBottom: 6 }}>{frontLabel}</span>
        {toolbar('front')}
        <textarea ref={frontRef} value={front} onChange={(e) => setFront(e.target.value)} onFocus={() => (targetField.current = 'front')}
          onPaste={(e) => onPaste(e, 'front')} aria-label={frontLabel} className="code"
          placeholder={type === 'cloze' ? 'Le protocole {{c1::OSPF}} utilise le port {{c2::89}}.' : 'Quelle commande affiche la table de routage ?'} />
      </div>

      <div className="field">
        <span className="lbl muted small" style={{ display: 'block', marginBottom: 6 }}>{backLabel}</span>
        {toolbar('back')}
        <textarea ref={backRef} value={back_} onChange={(e) => setBack(e.target.value)} onFocus={() => (targetField.current = 'back')}
          onPaste={(e) => onPaste(e, 'back')} aria-label={backLabel} className="code"
          placeholder={type === 'cloze' ? 'Indice ou précision (facultatif)' : '```\nshow ip route\n```'} />
      </div>

      <label className="field">
        <span className="lbl">Tags (séparés par des espaces)</span>
        <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} list="all-tags" autoCapitalize="none" placeholder="réseau cisco ccna" />
        <datalist id="all-tags">{tagList?.map((t) => <option key={t.tag} value={t.tag} />)}</datalist>
      </label>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn small" onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Masquer l’aperçu' : 'Aperçu'}</button>
        <span className="muted small">{error ? error : `${nbCards} carte${nbCards > 1 ? 's' : ''} générée${nbCards > 1 ? 's' : ''}`}</span>
      </div>

      {showPreview && !error && (
        <div>
          {ordsForNote(type, front).map((ord) => {
            const faces = cardFaces(previewNote, ord)
            return (
              <div key={ord} className="card preview">
                <div className="tag">Carte {ord + 1} — recto</div>
                <Markdown md={faces.front} />
                <div className="tag" style={{ marginTop: 12 }}>verso</div>
                <Markdown md={faces.back} />
              </div>
            )
          })}
        </div>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => save(false)} disabled={!!error}>Enregistrer</button>
        {!noteId && <button className="btn" onClick={() => save(true)} disabled={!!error}>Enregistrer et ajouter une autre</button>}
        {noteId && <button className="btn danger" onClick={remove}>Supprimer</button>}
      </div>
    </>
  )
}
