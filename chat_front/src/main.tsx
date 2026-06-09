import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureToken } from './auth'

// eslint-disable-next-line react-refresh/only-export-components
function Root() {
  useEffect(() => {
    ensureToken()
  }, [])
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
