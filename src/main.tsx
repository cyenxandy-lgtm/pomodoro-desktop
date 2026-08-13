import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeRuntimeProfile } from './services/runtimeProfile.ts'

const bootstrap = async (): Promise<void> => {
  await initializeRuntimeProfile()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
