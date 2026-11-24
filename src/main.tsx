import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// Service worker : précache l'application pour un usage 100 % hors ligne.
// « autoUpdate » : la nouvelle version s'active au prochain lancement.
registerSW({ immediate: true })

// Demande au navigateur de ne pas purger les données locales (important sur iOS/Android).
navigator.storage?.persist?.().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
