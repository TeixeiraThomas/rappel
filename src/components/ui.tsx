import { useEffect, useRef, useState } from 'react'

// Dialogues (saisie, confirmation, menu d'actions) et notifications, pilotés par des promesses :
//   const nom = await askText({ title: 'Nouveau paquet', label: 'Nom' })
// Remplace prompt()/confirm() natifs, peu fiables dans une PWA installée.

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

type DialogState =
  | { kind: 'text'; title: string; label?: string; value: string; okLabel: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: string; okLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: 'menu'; title: string; items: MenuItem[] }

let setDialogRef: ((d: DialogState | null) => void) | null = null
let setToastRef: ((m: string | null) => void) | null = null

export function askText(o: { title: string; label?: string; value?: string; okLabel?: string }): Promise<string | null> {
  return new Promise((resolve) =>
    setDialogRef?.({ kind: 'text', title: o.title, label: o.label, value: o.value ?? '', okLabel: o.okLabel ?? 'OK', resolve }),
  )
}

export function askConfirm(o: { title: string; message: string; okLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) =>
    setDialogRef?.({ kind: 'confirm', title: o.title, message: o.message, okLabel: o.okLabel ?? 'Confirmer', danger: o.danger ?? false, resolve }),
  )
}

export function showMenu(title: string, items: MenuItem[]): void {
  setDialogRef?.({ kind: 'menu', title, items })
}

let toastTimer: number | undefined
export function toast(message: string): void {
  setToastRef?.(message)
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => setToastRef?.(null), 2600)
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function DialogHost() {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [text, setText] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Élément qui avait le focus avant l'ouverture : le focus lui est rendu à la fermeture.
  const returnFocus = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    setDialogRef = (d) => {
      if (d && !wasOpen.current) returnFocus.current = document.activeElement as HTMLElement | null
      setDialog(d)
      if (d?.kind === 'text') setText(d.value)
    }
    setToastRef = setToastMsg
    return () => {
      setDialogRef = null
      setToastRef = null
    }
  }, [])

  // Focus initial à l'ouverture ; restitution à la fermeture.
  useEffect(() => {
    if (dialog) {
      wasOpen.current = true
      if (dialog.kind === 'text') setTimeout(() => inputRef.current?.select(), 0)
      else setTimeout(() => boxRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 0)
    } else if (wasOpen.current) {
      wasOpen.current = false
      const el = returnFocus.current
      returnFocus.current = null
      if (el && document.contains(el)) el.focus()
    }
  }, [dialog])

  const close = (result?: string | boolean | null) => {
    if (dialog?.kind === 'text') dialog.resolve(typeof result === 'string' ? result : null)
    if (dialog?.kind === 'confirm') dialog.resolve(result === true)
    setDialog(null)
  }

  // Échap ferme ; Tab / Maj+Tab restent dans le dialogue (piège à focus).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close(null)
    } else if (e.key === 'Tab') {
      const items = [...(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !boxRef.current?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !boxRef.current?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <>
      {dialog && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close(null)} onKeyDown={onKeyDown}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={boxRef}>
            <h2 id="dialog-title">{dialog.title}</h2>
            {dialog.kind === 'text' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (text.trim()) close(text.trim())
                }}
              >
                <label className="field" style={{ marginBottom: 0 }}>
                  <span className="lbl">{dialog.label ?? dialog.title}</span>
                  <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)} />
                </label>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => close(null)}>Annuler</button>
                  <button type="submit" className="btn primary" disabled={!text.trim()}>{dialog.okLabel}</button>
                </div>
              </form>
            )}
            {dialog.kind === 'confirm' && (
              <>
                <p className="muted" style={{ margin: 0 }}>{dialog.message}</p>
                <div className="actions">
                  <button className="btn" onClick={() => close(false)}>Annuler</button>
                  <button className={`btn ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>{dialog.okLabel}</button>
                </div>
              </>
            )}
            {dialog.kind === 'menu' && (
              <div>
                {dialog.items.map((it) => (
                  <button
                    key={it.label}
                    className={`menu-item${it.danger ? ' danger' : ''}`}
                    onClick={() => {
                      setDialog(null)
                      it.onClick()
                    }}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="toast-region" role="status" aria-live="polite">
        {toastMsg && <div className="toast">{toastMsg}</div>}
      </div>
    </>
  )
}
