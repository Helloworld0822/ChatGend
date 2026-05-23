import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { registerToken, findUserByToken } from './auth.js'

const app = new Hono()

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (c.req.method === 'OPTIONS') return c.text('', 204 as any)
  await next()
})

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Register a token (idempotent)
app.post('/auth/register', async (c) => {
  const body = await c.req.json()
  const token = body?.token
  const displayName = body?.displayName
  if (!token) return c.json({ error: 'token required' }, 400)
  await registerToken(token, displayName)
  return c.json({ ok: true })
})

// Who am I
app.get('/auth/whoami', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ user: null })
  const user = await findUserByToken(token)
  return c.json({ user })
})

// Rooms and messages
import * as Chat from './chat.js'
import * as AI from './ai.js'

// Create room (records creator_token if provided via Authorization header)
app.post('/rooms', async (c) => {
  const body = await c.req.json()
  const name = body?.name ?? 'Untitled Room'
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const room = await Chat.createRoom(name, body?.invite_hash, token ?? undefined)
  return c.json({ room })
})

// Join room (return room info). If body.invite_hash is provided, allow joining by invite hash.
app.post('/rooms/:id/join', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const inviteHash = body?.invite_hash
  if (inviteHash) {
    const room = await Chat.getRoomByInviteHash(inviteHash)
    if (!room) return c.json({ error: 'invite not found' }, 404)
    return c.json({ room })
  }

  const id = Number(c.req.param('id'))
  const room = await Chat.getRoomById(id)
  if (!room) return c.json({ error: 'not found' }, 404)
  return c.json({ room })
})

// List messages
app.get('/rooms/:id/messages', async (c) => {
  const id = Number(c.req.param('id'))
  const limit = Number(c.req.query('limit') ?? 100)
  const msgs = await Chat.listMessages(id, limit)
  return c.json({ messages: msgs })
})

// Summarize conversation in a room
app.get('/rooms/:id/summary', async (c) => {
  const id = Number(c.req.param('id'))
  const limit = Number(c.req.query('limit') ?? 200)
  const raw = await Chat.listMessages(id, limit)
  const messages = raw.map((r: any) => ({ role: r.user_name === 'system' ? 'system' : 'user', content: r.message, timestamp: r.created_at }))
  try {
    const summary = await AI.summarizeConversation(messages)
    return c.json({ summary })
  } catch (err: any) {
    return c.json({ error: 'ai error', detail: String(err) }, 500)
  }
})

// Recommend reply strategies for the current conversation
app.get('/rooms/:id/recommendations', async (c) => {
  const id = Number(c.req.param('id'))
  const limit = Number(c.req.query('limit') ?? 200)
  const num = Number(c.req.query('n') ?? 3)
  const raw = await Chat.listMessages(id, limit)
  const messages = raw.map((r: any) => ({ role: r.user_name === 'system' ? 'system' : 'user', content: r.message, timestamp: r.created_at }))
  try {
    const recs = await AI.recommendResponses(messages, { numSuggestions: num })
    return c.json({ recommendations: recs })
  } catch (err: any) {
    return c.json({ error: 'ai error', detail: String(err) }, 500)
  }
})

// Generate single reply suggestion
app.get('/rooms/:id/suggest-reply', async (c) => {
  const id = Number(c.req.param('id'))
  const limit = Number(c.req.query('limit') ?? 200)
  const tone = c.req.query('tone') ?? 'concise and friendly'
  const raw = await Chat.listMessages(id, limit)
  const messages = raw.map((r: any) => ({ role: r.user_name === 'system' ? 'system' : 'user', content: r.message, timestamp: r.created_at }))
  try {
    const suggestion = await AI.generateReplySuggestion(messages as any[], String(tone))
    return c.json({ suggestion })
  } catch (err: any) {
    return c.json({ error: 'ai error', detail: String(err) }, 500)
  }
})

// Send message
app.post('/rooms/:id/messages', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const text = body?.message
  if (!text) return c.json({ error: 'message required' }, 400)

  // Identify sender from token header
  const token = c.req.header('Authorization')?.replace('Bearer ', '') ?? null
  let userName = 'anonymous'
  if (token) {
    const user = await findUserByToken(token)
    userName = user?.display_name ?? token
  }

  const msg = await Chat.addMessage(id, userName, token, text)
  return c.json({ message: msg })
})

// Delete message (only message author or room creator can delete)
app.delete('/rooms/:id/messages/:messageId', async (c) => {
  const messageId = Number(c.req.param('messageId'))
  const token = c.req.header('Authorization')?.replace('Bearer ', '') ?? null
  if (!token) return c.json({ error: 'unauthenticated' }, 401)

  const msg = await Chat.findMessage(messageId)
  if (!msg) return c.json({ error: 'message not found' }, 404)

  // Find room to check creator
  const room = await Chat.getRoomById(msg.room_id)
  const roomCreator = room?.creator_token ?? null

  const isAuthor = msg.author_token === token
  const isRoomCreator = roomCreator === token
  if (!isAuthor && !isRoomCreator) return c.json({ error: 'forbidden' }, 403)

  await Chat.deleteMessage(messageId)
  return c.json({ ok: true })
})

// Translate endpoint using Google Translate API key from env
app.post('/translate', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const texts = body?.texts
  const target = body?.target
  if (!texts || !Array.isArray(texts) || !target) return c.json({ error: 'texts (string[]) and target (string) required' }, 400)

  const key = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!key) return c.json({ error: 'GOOGLE_TRANSLATE_API_KEY not set in environment' }, 500)

  try {
    const resp = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, target })
    })

    const json = await resp.json()
    if (!resp.ok) {
      return c.json({ error: 'translation failed', detail: json }, 500)
    }

    const translations = (json?.data?.translations || []).map((t: any) => t.translatedText)
    return c.json({ translations })
  } catch (err: any) {
    return c.json({ error: 'translation error', detail: String(err) }, 500)
  }
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
