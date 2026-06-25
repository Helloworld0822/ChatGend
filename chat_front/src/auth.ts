const TOKEN_KEY = 'persistent_user_token'
const NAME_KEY = 'persistent_user_name'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getDisplayName(): string | null {
  return localStorage.getItem(NAME_KEY)
}

export function setDisplayName(name: string): void {
  localStorage.setItem(NAME_KEY, name)
}

export function clearDisplayName(): void {
  localStorage.removeItem(NAME_KEY)
}

export function generateToken(): string {
  return 'tok_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export async function ensureToken(): Promise<string> {
  let token = getToken()
  
  if (!token) {
    token = generateToken()
    setToken(token)
  }
  
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
