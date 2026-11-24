import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { requestPersistence } from './lib/storage'
import './styles.css'

// Service worker : précache l'application pour un usage 100 % hors ligne.
// « autoUpdate » : la nouvelle version s'active au prochain lancement.
registerSW({ immediate: true })

// Demande au navigateur de ne pas purger les données locales (important sur iOS/Android).
void requestPersistence()
// Certains navigateurs n'accordent la persistance qu'après une interaction : on réessaie au premier geste.
window.addEventListener('pointerdown', () => void requestPersistence(), { once: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
