import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

function base64UrlEncode(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input))
  return b.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessTokenFromServiceAccount(sa: any): Promise<{ token: string; projectId?: string }> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const scope = 'https://www.googleapis.com/auth/cloud-translation'
  const claim = {
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const toSign = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(toSign)
  signer.end()
  const signature = signer.sign(sa.private_key)
  const jwt = `${toSign}.${base64UrlEncode(signature)}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  })

  const json = await resp.json()
  if (!resp.ok) {
    throw new Error('oauth token error: ' + JSON.stringify(json))
  }

  return { token: json.access_token, projectId: sa.project_id }
}

async function resolveCredentialInput(input?: string | null): Promise<string | null> {
  // Priority: explicit input string; if looks like file path and exists -> read file; if looks like JSON -> return as-is; else return as-is
  if (!input) return null

  const trimmed = input.trim()

  // If starts with '{', likely JSON content
  if (trimmed.startsWith('{')) return trimmed

  // If looks like a relative or absolute path or endsWith .json, try to read
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.toLowerCase().endsWith('.json')) {
    try {
      const full = path.resolve(trimmed)
      const data = await fs.readFile(full, 'utf8')
      return data
    } catch (e) {
      // not a readable file, fall back to returning the original string
      return trimmed
    }
  }

  // Otherwise return as-is (likely an API key string)
  return trimmed
}

export async function translateTexts(texts: string[], target: string, apiKeyOrJsonOrPath?: string | null): Promise<string[]> {
  if (!Array.isArray(texts) || texts.length === 0) return []
  if (!target) return texts

  const resolved = await resolveCredentialInput(apiKeyOrJsonOrPath ?? null)

  // If resolved looks like JSON => try parse service account
  let maybeSa: any | null = null
  if (resolved && resolved.trim().startsWith('{')) {
    try {
      maybeSa = JSON.parse(resolved)
    } catch (e) {
      maybeSa = null
    }
  }

  if (maybeSa && maybeSa.private_key && maybeSa.client_email) {
    const { token, projectId } = await getAccessTokenFromServiceAccount(maybeSa)
    if (!projectId) throw new Error('service account JSON missing project_id')

    const url = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/locations/global:translateText`
    const body = { contents: texts, mimeType: 'text/plain', targetLanguageCode: target }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })

    const json = await resp.json()
    if (!resp.ok) {
      throw new Error('translate v3 error: ' + JSON.stringify(json))
    }

    const result: string[] = []
    if (Array.isArray(json?.translations)) {
      for (const t of json.translations) result.push(t.translatedText ?? '')
    } else if (Array.isArray(json?.translations?.translations)) {
      for (const t of json.translations.translations) result.push(t.translatedText ?? '')
    }

    return result
  }

  // Fallback: treat resolved as simple API key and call v2
  const key = resolved ?? apiKeyOrJsonOrPath
  if (!key) throw new Error('no translation credentials provided')

  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target })
  })

  const json = await resp.json()
  if (!resp.ok) {
    const detail = json || { status: resp.status, statusText: resp.statusText }
    throw new Error('translate API error: ' + JSON.stringify(detail))
  }

  const translations = (json?.data?.translations || []).map((t: any) => t.translatedText)
  return translations
}
