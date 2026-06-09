import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { registerToken, findUserByToken } from './auth.js'
import { attachChatWebSocket } from './live-chat.js'

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

// List all rooms
app.get('/rooms', async (c) => {
  const limit = Number(c.req.query('limit') ?? 50)
  const rooms = await Chat.listRooms(limit)
  return c.json({ rooms })
})

// Find room by invite hash
app.get('/rooms/by-invite/:hash', async (c) => {
  const hash = c.req.param('hash')
  const room = await Chat.getRoomByInviteHash(hash)
  if (!room) return c.json({ error: 'not found' }, 404)
  return c.json({ room })
})

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

// Rename room (only room creator can rename)
app.patch('/rooms/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const name = body?.name
  if (!name) return c.json({ error: 'name required' }, 400)
  const room = await Chat.updateRoom(id, name)
  if (!room) return c.json({ error: 'not found' }, 404)
  return c.json({ room })
})

// Delete room (only room creator can delete)
app.delete('/rooms/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const token = c.req.header('Authorization')?.replace('Bearer ', '') ?? null
  if (!token) return c.json({ error: 'unauthenticated' }, 401)

  const room = await Chat.getRoomById(id)
  if (!room) return c.json({ error: 'not found' }, 404)

  if (room.creator_token && room.creator_token !== token) {
    return c.json({ error: 'forbidden' }, 403)
  }

  await Chat.deleteRoom(id)
  return c.json({ ok: true })
})

// Translate endpoint using Google Translate API key from env
import { translateTexts } from './transcript.js'

app.post('/translate', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const texts = body?.texts
  const target = body?.target
  if (!texts || !Array.isArray(texts) || !target) return c.json({ error: 'texts (string[]) and target (string) required' }, 400)

  // Prefer a credentials env var (can be a path to a JSON file or JSON content), fall back to simple API key
  const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_TRANSLATE_API_KEY
  if (!cred) return c.json({ error: 'GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_TRANSLATE_API_KEY must be set' }, 500)

  try {
    const translations = await translateTexts(texts, target, cred)
    return c.json({ translations })
  } catch (err: any) {
    return c.json({ error: 'translation error', detail: String(err) }, 500)
  }
})

function logError(context: string, error: unknown) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`[backend] ${context}:`, message)
}

const server = serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
  console.log(`[backend] Google Translate API key loaded: ${Boolean(process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_API_KEY)}`)
})

attachChatWebSocket(server)

let shuttingDown = false

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[backend] received ${signal}, shutting down gracefully`)
  server.close()
  console.log('[backend] shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
process.on('unhandledRejection', (reason) => {
  logError('unhandled rejection', reason)
})
process.on('uncaughtException', (err) => {
  logError('uncaught exception', err)
})
