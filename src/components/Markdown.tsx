import DOMPurify from 'dompurify'
import { useEffect, useMemo, useState } from 'react'
import { loadMedia, substituteMedia } from '../lib/media'
import { mdToHtml, mediaIds } from '../lib/markdown'

// Les liens s'ouvrent dans un nouvel onglet, sans accès à la fenêtre d'origine.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Rend du Markdown (+ HTML assaini, images locales, bouton « Copier » sur les blocs de code). */
export function Markdown({ md, className = '' }: { md: string; className?: string }) {
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    loadMedia(mediaIds(md)).then((changed) => alive && changed && setVersion((v) => v + 1))
    return () => {
      alive = false
    }
  }, [md])

  const html = useMemo(() => {
    const raw = substituteMedia(mdToHtml(md))
    const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })
    // Ajout du bouton après l'assainissement : le HTML ajouté est statique et maîtrisé.
    return clean.replace(/<pre>/g, '<pre><button type="button" class="copy" data-copy>Copier</button>')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md, version])

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (!t.matches?.('button[data-copy]')) return
    e.stopPropagation()
    const code = t.parentElement?.querySelector('code')?.textContent ?? ''
    navigator.clipboard?.writeText(code).then(
      () => {
        t.textContent = 'Copié ✓'
        setTimeout(() => (t.textContent = 'Copier'), 1500)
      },
      () => (t.textContent = 'Échec'),
    )
  }

  return <div className={`md ${className}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
