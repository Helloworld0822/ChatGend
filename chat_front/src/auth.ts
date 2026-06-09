const TOKEN_KEY = 'persistent_user_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function generateToken(): string {
  return 'tok_' + Math.random().toString(36).slice(2, 10)
}

export async function ensureToken(): Promise<string> {
  let token = getToken()
  
  if (!token) {
    token = generateToken()
    setToken(token)
  }
  
  // Register with backend (best-effort, only once per session)
  try {
    await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
  } catch {
    // Ignore registration errors
  }
  
  return token
}

export function authFetch(input: RequestInfo, init?: RequestInit) {
  const token = getToken()
  const headers = new Headers(init?.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
