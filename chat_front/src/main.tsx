import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Simple client-side persistent token logic
function ensureToken() {
  const key = 'persistent_user_token'
  let token = localStorage.getItem(key)
  if (!token) {
    // Create a random token — UUID-like
    token = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, (c:any) =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
    localStorage.setItem(key, token)
    // Register with backend (best-effort)
    fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).catch(() => {})
  } else {
    // Optionally re-register to ensure record exists
    fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).catch(() => {})
  }
  return token
}

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
