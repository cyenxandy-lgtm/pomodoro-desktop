import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/theme.css'
import './index.css'
import App from './App.tsx'
import { initializeRuntimeProfile } from './services/runtimeProfile.ts'
import { applyTheme } from './hooks/useTheme.ts'
import { loadPersistedState } from './utils/storage.ts'

const bootstrap = async (): Promise<void> => {
  await initializeRuntimeProfile()
  const initialState = loadPersistedState()
  applyTheme(
    document.documentElement,
    initialState.appearance,
    initialState.accent,
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
