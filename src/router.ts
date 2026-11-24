import { useEffect, useMemo, useState } from 'react'

// Routeur minimal basé sur le hash (#/chemin?clé=valeur) : fonctionne sur n'importe quel
// hébergement statique (GitHub Pages…) sans configuration de redirection serveur.

export interface Route {
  path: string[]
  query: URLSearchParams
}

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  const [p, q] = h.split('?')
  return {
    path: p.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(q ?? ''),
  }
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return useMemo(() => parse(hash), [hash])
}

/** Aller à une route (ex. « /study/abc »). */
export function navigate(to: string, replace = false): void {
  const url = '#' + to
  if (replace) window.history.replaceState(null, '', url)
  else window.location.hash = url
  // replaceState ne déclenche pas hashchange
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export const href = (to: string) => '#' + to

export function back(fallback = '/'): void {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback)
}
