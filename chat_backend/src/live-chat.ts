import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { findUserByToken } from './auth.js'
import * as Chat from './chat.js'

type ClientCommand =
  | {
      type: 'auth'
      token: string
    }
  | {
      type: 'send-message'
      requestId: string
      text: string
    }

type ServerEvent =
  | {
      type: 'snapshot'
      room: Chat.PublicRoomSummary
      messages: Chat.PublicMessage[]
    }
  | {
      type: 'message'
      room: Chat.PublicRoomSummary
      message: Chat.PublicMessage
    }
  | {
      type: 'room'
      room: Chat.PublicRoomSummary
    }
  | {
      type: 'sent'
      requestId: string
    }
  | {
      type: 'error'
      message: string
      requestId?: string
    }
  | {
      type: 'system'
      kind: 'join' | 'leave'
      userName: string
      at: string
    }

type ClientState = {
  roomId: number
  token: string | null
  userName: string
}

type UpgradeServer = {
  on(event: 'upgrade', listener: (req: IncomingMessage, socket: Socket, head: Buffer) => void): unknown
}

const wss = new WebSocketServer({ noServer: true })
const roomSockets = new Map<number, Set<WebSocket>>()
const clientStates = new Map<WebSocket, ClientState>()

function toPublicRoom(room: Chat.ChatRoomSummary | Chat.ChatRoom): Chat.PublicRoomSummary {
  const { creator_token, ...publicRoom } = room
  return publicRoom as Chat.PublicRoomSummary
}

function toPublicMessage(message: Chat.ChatMessage): Chat.PublicMessage {
  const { author_token, ...publicMessage } = message
  return publicMessage
}

function sendJson(ws: WebSocket, payload: ServerEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function broadcast(roomId: number, payload: ServerEvent) {
  const sockets = roomSockets.get(roomId)
  if (!sockets) return

  for (const socket of sockets) {
    sendJson(socket, payload)
  }
}

function addSocketToRoom(roomId: number, ws: WebSocket) {
  let sockets = roomSockets.get(roomId)
  if (!sockets) {
    sockets = new Set<WebSocket>()
    roomSockets.set(roomId, sockets)
  }
  sockets.add(ws)
}

function removeSocket(ws: WebSocket) {
  const state = clientStates.get(ws)
  if (state) {
    const sockets = roomSockets.get(state.roomId)
    sockets?.delete(ws)
    if (sockets && sockets.size === 0) {
      roomSockets.delete(state.roomId)
    }
  }

  clientStates.delete(ws)
}

function parseClientCommand(raw: string): ClientCommand | null {
  try {
    const data = JSON.parse(raw) as Partial<ClientCommand>
    if (data?.type === 'auth') {
      if (typeof data.token !== 'string') return null
      return { type: 'auth', token: data.token }
    }
    if (data?.type !== 'send-message') return null
    if (typeof data.requestId !== 'string' || typeof data.text !== 'string') return null
    return { type: 'send-message', requestId: data.requestId, text: data.text }
  } catch {
    return null
  }
}

function rawDataToString(data: RawData) {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return data.toString()
}

async function sendSnapshot(ws: WebSocket, roomId: number) {
  const room = await Chat.getRoomSummary(roomId)
  if (!room) {
    sendJson(ws, { type: 'error', message: 'room not found' })
    ws.close(1008, 'room not found')
    return false
  }

  const messages = await Chat.listMessages(roomId, 200)
  sendJson(ws, {
    type: 'snapshot',
    room: toPublicRoom(room),
    messages: messages.map(toPublicMessage),
  })
  return true
}

async function handleSendMessage(ws: WebSocket, command: ClientCommand) {
  if (command.type !== 'send-message') return
  const state = clientStates.get(ws)
  if (!state) {
    sendJson(ws, { type: 'error', requestId: command.requestId, message: 'socket is not attached to a room' })
    return
  }

  if (!state.token) {
    sendJson(ws, { type: 'error', requestId: command.requestId, message: 'authentication required' })
    return
  }

  const member = await Chat.isMember(state.roomId, state.token)
  if (!member) {
    sendJson(ws, { type: 'error', requestId: command.requestId, message: 'not a member of this room' })
    return
  }

  const text = command.text.trim()
  if (!text) {
    sendJson(ws, { type: 'error', requestId: command.requestId, message: 'message required' })
    return
  }

  const user = await findUserByToken(state.token)
  const userName = user?.display_name ?? state.token ?? 'anonymous'
  const message = await Chat.addMessage(state.roomId, userName, state.token, text)
  const room = await Chat.getRoomSummary(state.roomId)

  if (!room) {
    sendJson(ws, { type: 'error', requestId: command.requestId, message: 'room not found' })
    return
  }

  sendJson(ws, { type: 'sent', requestId: command.requestId })
  broadcast(state.roomId, {
    type: 'message',
    room: toPublicRoom(room),
    message: toPublicMessage(message),
  })
  broadcast(state.roomId, {
    type: 'room',
    room: toPublicRoom(room),
  })
}

async function handleConnection(ws: WebSocket, _req: IncomingMessage, url: URL) {
  const roomId = Number(url.searchParams.get('roomId'))

  if (!Number.isFinite(roomId) || roomId <= 0) {
    sendJson(ws, { type: 'error', message: 'roomId is required' })
    ws.close(1008, 'roomId required')
    return
  }

  clientStates.set(ws, { roomId, token: null, userName: 'unknown' })
  addSocketToRoom(roomId, ws)

  ws.on('close', () => {
    const state = clientStates.get(ws)
    removeSocket(ws)
    if (state) {
      broadcast(state.roomId, {
        type: 'system',
        kind: 'leave',
        userName: state.userName,
        at: new Date().toISOString(),
      })
    }
  })

  ws.on('message', async (data: RawData) => {
    const state = clientStates.get(ws)
    if (!state) return

    const raw = rawDataToString(data)
    const command = parseClientCommand(raw)
    if (!command) {
      sendJson(ws, { type: 'error', message: 'unsupported websocket message' })
      return
    }

    if (command.type === 'auth') {
      const member = await Chat.isMember(roomId, command.token)
      if (!member) {
        sendJson(ws, { type: 'error', message: 'authentication failed' })
        return
      }
      const user = await findUserByToken(command.token)
      const userName = user?.display_name ?? command.token ?? 'anonymous'

      clientStates.set(ws, { roomId, token: command.token, userName })

      try {
        const ok = await sendSnapshot(ws, roomId)
        if (!ok) {
          removeSocket(ws)
          return
        }
        broadcast(roomId, {
          type: 'system',
          kind: 'join',
          userName,
          at: new Date().toISOString(),
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sendJson(ws, { type: 'error', message })
        ws.close(1011, 'snapshot failed')
        removeSocket(ws)
      }
      return
    }

    if (!state.token) {
      sendJson(ws, { type: 'error', requestId: command.type === 'send-message' ? command.requestId : undefined, message: 'authenticate first' })
      return
    }

    void handleSendMessage(ws, command).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      sendJson(ws, { type: 'error', requestId: command.requestId, message })
    })
  })
}

export function attachChatWebSocket(server: UpgradeServer) {
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      void handleConnection(ws, req, url)
    })
  })
}
