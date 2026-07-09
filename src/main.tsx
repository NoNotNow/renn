import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { setupClearCacheCommand } from './utils/clearCache'
import { installPreventTrackpadSwipeNavigation } from './input/preventSwipeNavigation'

// Setup debugging utilities
setupClearCacheCommand()
installPreventTrackpadSwipeNavigation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
