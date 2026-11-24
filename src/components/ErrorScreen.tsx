import { Component, type ReactNode } from 'react'
import { friendlyError } from '../lib/errors'

/** Écran d'erreur plein page : message clair, pistes de résolution, bouton de rechargement. */
export function ErrorScreen({ title = 'Un problème est survenu', error }: { title?: string; error: unknown }) {
  return (
    <div className="content" role="alert" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
      <div className="empty card">
        <h2>{title}</h2>
        <p>{friendlyError(error)}</p>
        <p className="muted small">Vos cartes ne sont pas perdues : elles restent stockées sur l'appareil. Si le problème persiste, exportez une sauvegarde depuis les Réglages ou rechargez l'application.</p>
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => window.location.reload()}>Recharger</button>
          <a className="btn" href="#/settings" onClick={() => setTimeout(() => window.location.reload(), 0)}>Ouvrir les Réglages</a>
        </div>
      </div>
    </div>
  )
}

/** Intercepte les erreurs de rendu pour éviter une page blanche. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    return this.state.error ? <ErrorScreen error={this.state.error} /> : this.props.children
  }
}
