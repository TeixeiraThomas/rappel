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

export function DialogHost() {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDialogRef = (d) => {
      setDialog(d)
      if (d?.kind === 'text') setText(d.value)
    }
    setToastRef = setToastMsg
    return () => {
      setDialogRef = null
      setToastRef = null
    }
  }, [])

  useEffect(() => {
    if (dialog?.kind === 'text') setTimeout(() => inputRef.current?.select(), 30)
  }, [dialog])

  const close = (result?: string | boolean | null) => {
    if (dialog?.kind === 'text') dialog.resolve(typeof result === 'string' ? result : null)
    if (dialog?.kind === 'confirm') dialog.resolve(result === true)
    setDialog(null)
  }

  return (
    <>
      {dialog && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={dialog.title}>
            <h2>{dialog.title}</h2>
            {dialog.kind === 'text' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (text.trim()) close(text.trim())
                }}
              >
                {dialog.label && <div className="muted small" style={{ marginBottom: 6 }}>{dialog.label}</div>}
                <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
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
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  )
}
