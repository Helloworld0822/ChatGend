import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { authFetch, getToken, generateToken, setToken } from './auth'

import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/textfield/filled-text-field.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'
import '@material/web/icon/icon.js'
import '@material/web/dialog/dialog.js'

type Room = {
  id: number
  name: string
  invite_hash?: string | null
  created_at?: string
  last_message?: string
  message_count?: number
}

type Message = {
  id: number
  room_id: number
  user_name: string
  message: string
  created_at: string
}

type SocketSnapshotEvent = {
  type: 'snapshot'
  room: Room
  messages: Message[]
}

type SocketMessageEvent = {
  type: 'message'
  room: Room
  message: Message
}

type SocketRoomEvent = {
  type: 'room'
  room: Room
}

type SocketSentEvent = {
  type: 'sent'
  requestId: string
}

type SocketErrorEvent = {
  type: 'error'
  message: string
  requestId?: string
}

type SocketSystemEvent = {
  type: 'system'
  kind: 'join' | 'leave'
  userName: string
  at: string
}

type SocketEvent =
  | SocketSnapshotEvent
  | SocketMessageEvent
  | SocketRoomEvent
  | SocketSentEvent
  | SocketErrorEvent
  | SocketSystemEvent

type SystemEvent = {
  id: string
  kind: 'join' | 'leave'
  userName: string
  at: string
}

type PendingRequest = {
  resolve: () => void
  reject: (err: Error) => void
}

const LANG_KEY = 'preferred_language'
const AVAILABLE_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
]

function toErrorMessage(value: unknown) {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function buildInviteUrl(inviteHash?: string | null) {
  if (!inviteHash) return ''
  const url = new URL(window.location.href)
  url.searchParams.set('invite', inviteHash)
  return url.toString()
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const merged = new Map<number, Message>()
  for (const message of current) merged.set(message.id, message)
  for (const message of incoming) merged.set(message.id, message)
  return Array.from(merged.values()).sort((a, b) => a.id - b.id)
}

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [translated, setTranslated] = useState<Record<number, string>>({})
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [me, setMe] = useState<string | null>(null)
  const [preferredLang, setPreferredLang] = useState<string>(localStorage.getItem(LANG_KEY) || 'en')
  const [error, setError] = useState<string | null>(null)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [sending, setSending] = useState(false)
  const [socketStatus, setSocketStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'>('idle')
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([])

  const [showRegister, setShowRegister] = useState<boolean>(() => !getToken())
  const [regName, setRegName] = useState<string>('')
  const [regLang, setRegLang] = useState<string>(preferredLang)
  const [regToken, setRegToken] = useState<string>('')

  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [showEditRoom, setShowEditRoom] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [editRoomName, setEditRoomName] = useState('')
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null)

  const currentRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  )

  const timeline = useMemo(() => {
    type TimelineItem =
      | { kind: 'message'; key: string; at: number; data: Message }
      | { kind: 'system'; key: string; at: number; data: SystemEvent }

    const items: TimelineItem[] = []
    for (const m of messages) {
      items.push({ kind: 'message', key: `m-${m.id}`, at: new Date(m.created_at).getTime(), data: m })
    }
    for (const s of systemEvents) {
      items.push({ kind: 'system', key: s.id, at: new Date(s.at).getTime(), data: s })
    }
    items.sort((a, b) => a.at - b.at)
    return items
  }, [messages, systemEvents])

  const socketRef = useRef<WebSocket | null>(null)
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>())
  const systemSeqRef = useRef(0)

  async function fetchRooms() {
    setLoadingRooms(true)
    try {
      const resp = await authFetch('/api/rooms?limit=100')
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'failed to load rooms')

      const nextRooms: Room[] = Array.isArray(json?.rooms) ? json.rooms : []
      setRooms(nextRooms)

      if (selectedRoomId == null && nextRooms.length > 0) {
        setSelectedRoomId(nextRooms[0].id)
      } else if (selectedRoomId != null && !nextRooms.some((room) => room.id === selectedRoomId) && nextRooms.length > 0) {
        setSelectedRoomId(nextRooms[0].id)
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setLoadingRooms(false)
    }
  }

  async function fetchAiSuggestions(roomId: number) {
    setLoadingSuggestions(true)
    try {
      const resp = await authFetch(`/api/rooms/${roomId}/recommendations?n=3&limit=200`)
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.detail || json?.error || 'failed to load suggestions')
      setAiSuggestions(Array.isArray(json?.recommendations) ? json.recommendations : [])
    } catch (err) {
      setError(toErrorMessage(err))
      setAiSuggestions([])
    } finally {
      setLoadingSuggestions(false)
    }
  }

  function closeActiveSocket() {
    const socket = socketRef.current
    socketRef.current = null

    for (const pending of pendingRequestsRef.current.values()) {
      pending.reject(new Error('websocket connection closed'))
    }
    pendingRequestsRef.current.clear()

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close()
    }
  }

  function upsertRoom(nextRoom: Room) {
    setRooms((prev) => {
      const exists = prev.some((room) => room.id === nextRoom.id)
      if (exists) {
        return prev.map((room) => (room.id === nextRoom.id ? { ...room, ...nextRoom } : room))
      }
      return [nextRoom, ...prev]
    })
  }

  function handleSocketEvent(event: SocketEvent, roomId: number) {
    if (event.type === 'snapshot') {
      upsertRoom(event.room)
      setMessages((prev) => mergeMessages(prev, event.messages))
      setTranslated({})
      setLoadingMessages(false)
      setSocketStatus('connected')
      void fetchAiSuggestions(roomId)
      return
    }

    if (event.type === 'message') {
      upsertRoom(event.room)
      setMessages((prev) => mergeMessages(prev, [event.message]))
      return
    }

    if (event.type === 'room') {
      upsertRoom(event.room)
      return
    }

    if (event.type === 'sent') {
      const pending = pendingRequestsRef.current.get(event.requestId)
      pending?.resolve()
      pendingRequestsRef.current.delete(event.requestId)
      return
    }

    if (event.type === 'system') {
      systemSeqRef.current += 1
      const id = `sys-${systemSeqRef.current}`
      setSystemEvents((prev) => [
        ...prev,
        { id, kind: event.kind, userName: event.userName, at: event.at },
      ])
      return
    }

    const requestId = event.requestId
    if (requestId) {
      const pending = pendingRequestsRef.current.get(requestId)
      if (!pending) return
      pending.reject(new Error(event.message))
      pendingRequestsRef.current.delete(requestId)
      return
    }

    setSocketStatus('error')
    setError(event.message)
  }

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    authFetch('/api/auth/whoami')
      .then((r) => r.json())
      .then((data) => {
        setMe(data?.user?.display_name ?? data?.user?.token ?? null)
      })
      .catch((err) => setError(toErrorMessage(err)))

    void fetchRooms()
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    const invite = new URL(window.location.href).searchParams.get('invite')
    if (!invite) return

    authFetch(`/api/rooms/by-invite/${encodeURIComponent(invite)}`)
      .then((r) => r.json().then((json) => ({ ok: r.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) throw new Error(json?.error || 'invite not found')
        const room = json?.room as Room | undefined
        if (!room) return
        setRooms((prev) => {
          if (prev.some((item) => item.id === room.id)) return prev
          return [room, ...prev]
        })
        setSelectedRoomId(room.id)
      })
      .catch((err) => setError(toErrorMessage(err)))
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    closeActiveSocket()

    if (selectedRoomId == null) {
      setMessages([])
      setTranslated({})
      setLoadingMessages(false)
      setSocketStatus('idle')
      return
    }

    setLoadingMessages(true)
    setMessages([])
    setTranslated({})
    setAiSuggestions([])
    setSystemEvents([])
    setSocketStatus('connecting')

    const token = getToken()
    const query = new URLSearchParams({ roomId: String(selectedRoomId) })
    if (token) query.set('token', token)

    const socket = new WebSocket(`/api/ws?${query.toString()}`)
    socketRef.current = socket

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) return
      try {
        const data = JSON.parse(event.data) as SocketEvent
        handleSocketEvent(data, selectedRoomId)
      } catch (err) {
        setSocketStatus('error')
        setError(toErrorMessage(err))
      }
    }

    socket.onclose = () => {
      if (socketRef.current !== socket) return
      socketRef.current = null
      setSocketStatus('disconnected')
      for (const pending of pendingRequestsRef.current.values()) {
        pending.reject(new Error('websocket connection closed'))
      }
      pendingRequestsRef.current.clear()
      setLoadingMessages(false)
    }

    socket.onerror = () => {
      if (socketRef.current !== socket) return
      setSocketStatus('error')
      setLoadingMessages(false)
    }

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      for (const pending of pendingRequestsRef.current.values()) {
        pending.reject(new Error('websocket connection closed'))
      }
      pendingRequestsRef.current.clear()
      socket.close()
    }
  }, [selectedRoomId])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!messages.length) {
      setTranslated({})
      return
    }

    async function doTranslate() {
      const texts = messages.map((m) => m.message)
      try {
        const resp = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts, target: preferredLang }),
        })
        const json = await resp.json()
        if (json?.translations && Array.isArray(json.translations)) {
          const map: Record<number, string> = {}
          messages.forEach((m, i) => { map[m.id] = json.translations[i] })
          setTranslated(map)
        }
      } catch (e) {
        console.error('translation error', e)
      }
    }

    if (preferredLang) void doTranslate()
  }, [preferredLang, messages.length])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function send() {
    if (!input.trim() || selectedRoomId == null) return
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('websocket connection is not ready')
      return
    }

    const requestId = crypto.randomUUID()
    const promise = new Promise<void>((resolve, reject) => {
      pendingRequestsRef.current.set(requestId, { resolve, reject })
    })

    setSending(true)
    socket.send(JSON.stringify({ type: 'send-message', requestId, text: input }))
    setInput('')

    try {
      await promise
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  async function handleSuggestionClick(text: string) {
    setInput(text)
    await send()
  }

  function changeLang(code: string) {
    setPreferredLang(code)
    localStorage.setItem(LANG_KEY, code)
  }

  async function handleRegister(e?: FormEvent | Event) {
    if (e && 'preventDefault' in e) e.preventDefault()
    const tokenToUse = regToken || generateToken()

    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToUse, displayName: regName || tokenToUse }),
      })
      if (!resp.ok) {
        const json = await resp.json()
        throw new Error(json?.error || 'registration failed')
      }

      setToken(tokenToUse)
      localStorage.setItem(LANG_KEY, regLang)
      setRegToken(tokenToUse)
      setPreferredLang(regLang)
      setShowRegister(false)

      const whoami = await authFetch('/api/auth/whoami')
      const whoamiJson = await whoami.json()
      setMe(whoamiJson?.user?.display_name ?? tokenToUse)
    } catch (err) {
      console.error('register failed', err)
      alert('Registration failed: ' + toErrorMessage(err))
    }
  }

  async function handleCreateRoom(e?: FormEvent | Event) {
    if (e && 'preventDefault' in e) e.preventDefault()
    if (!roomName.trim()) return

    try {
      const resp = await authFetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim() }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'create failed')
      setRoomName('')
      setShowCreateRoom(false)
      const room = json?.room as Room | undefined
      if (room) {
        setCreatedRoom(room)
        setRooms((prev) => {
          if (prev.some((r) => r.id === room.id)) return prev
          return [room, ...prev]
        })
        setSelectedRoomId(room.id)
      }
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  async function handleRenameRoom(e?: FormEvent | Event) {
    if (e && 'preventDefault' in e) e.preventDefault()
    if (!editRoomName.trim() || selectedRoomId == null) return

    try {
      const resp = await authFetch(`/api/rooms/${selectedRoomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editRoomName.trim() }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'rename failed')
      setEditRoomName('')
      setShowEditRoom(false)
      void fetchRooms()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  async function handleDeleteRoom() {
    if (selectedRoomId == null) return
    if (!confirm('Delete this room?')) return

    systemSeqRef.current += 1
    const id = `sys-${systemSeqRef.current}`
    setSystemEvents((prev) => [
      ...prev,
      { id, kind: 'leave' as const, userName: me ?? 'unknown', at: new Date().toISOString() },
    ])

    await new Promise((resolve) => setTimeout(resolve, 500))

    try {
      const resp = await authFetch(`/api/rooms/${selectedRoomId}`, { method: 'DELETE' })
      if (!resp.ok) {
        const json = await resp.json()
        throw new Error(json?.error || 'delete failed')
      }
      setRooms((prev) => prev.filter((r) => r.id !== selectedRoomId))
      setSelectedRoomId(null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  return (
    <>
      {showRegister && (
        <md-dialog open>
          <div slot="headline">Welcome — register your name</div>
          <form slot="content" onSubmit={(e) => { e.preventDefault(); void handleRegister(e) }}>
            <div className="modal-field">
              <md-outlined-text-field
                label="Name"
                value={regName}
                onInput={(e) => setRegName((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="modal-field">
              <md-outlined-text-field
                label="Language"
                value={regLang}
                onInput={(e) => setRegLang((e.target as HTMLSelectElement).value)}
              />
            </div>
            <div className="modal-field">
              <md-outlined-text-field
                label="Token (optional)"
                placeholder="auto-generate if empty"
                value={regToken}
                onInput={(e) => setRegToken((e.target as HTMLInputElement).value)}
              />
            </div>
          </form>
          <div slot="actions">
            <md-filled-button onClick={() => void handleRegister()}>Register</md-filled-button>
            <md-outlined-button onClick={() => { const t = generateToken(); setRegToken(t); setRegName(''); setRegLang(preferredLang) }}>Generate Token</md-outlined-button>
          </div>
        </md-dialog>
      )}

      {showCreateRoom && (
        <md-dialog open>
          <div slot="headline">새 방 만들기</div>
          <form slot="content" onSubmit={(e) => { e.preventDefault(); void handleCreateRoom(e) }}>
            <div className="modal-field">
              <md-outlined-text-field
                label="방 이름"
                value={roomName}
                onInput={(e) => setRoomName((e.target as HTMLInputElement).value)}
              />
            </div>
          </form>
          <div slot="actions">
            <md-filled-button onClick={() => void handleCreateRoom()}>Create</md-filled-button>
            <md-outlined-button onClick={() => setShowCreateRoom(false)}>Cancel</md-outlined-button>
          </div>
        </md-dialog>
      )}

      {showEditRoom && (
        <md-dialog open>
          <div slot="headline">방 이름 수정</div>
          <form slot="content" onSubmit={(e) => { e.preventDefault(); void handleRenameRoom(e) }}>
            <div className="modal-field">
              <md-outlined-text-field
                label="방 이름"
                value={editRoomName}
                onInput={(e) => setEditRoomName((e.target as HTMLInputElement).value)}
              />
            </div>
          </form>
          <div slot="actions">
            <md-filled-button onClick={() => void handleRenameRoom()}>Save</md-filled-button>
            <md-outlined-button onClick={() => setShowEditRoom(false)}>Cancel</md-outlined-button>
          </div>
        </md-dialog>
      )}

      {createdRoom && (
        <md-dialog open>
          <div slot="headline">방이 생성되었습니다</div>
          <div slot="content">
            <div className="modal-field">
              <md-outlined-text-field
                label="초대 링크"
                value={buildInviteUrl(createdRoom.invite_hash)}
                readonly
              />
            </div>
          </div>
          <div slot="actions">
            <md-filled-button onClick={async () => {
              await navigator.clipboard.writeText(buildInviteUrl(createdRoom.invite_hash))
            }}>
              Copy Link
            </md-filled-button>
            <md-outlined-button onClick={() => setCreatedRoom(null)}>Close</md-outlined-button>
          </div>
        </md-dialog>
      )}

      <div className="app-container">
        <aside className="sidebar">
          <div className="sidebar-header">Chats</div>
          <div className="sidebar-user">Me: {me ?? 'unknown'}</div>

          <div className="sidebar-lang">
            <label className="sidebar-lang-label">Language:</label>
            <select value={preferredLang} onChange={(e) => changeLang((e.target as HTMLSelectElement).value)} className="sidebar-lang-select">
              {AVAILABLE_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <md-list>
            {loadingRooms && <md-list-item><div slot="headline">Loading rooms...</div></md-list-item>}
            {!loadingRooms && rooms.length === 0 && <md-list-item><div slot="headline">No rooms yet</div></md-list-item>}
            {rooms.map((room) => (
              <md-list-item
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                selected={room.id === selectedRoomId}
              >
                <div slot="headline">{room.name}</div>
                <div slot="supporting-text">{room.last_message || `${room.message_count ?? 0} messages`}</div>
              </md-list-item>
            ))}
          </md-list>

          <div className="sidebar-footer">
            <md-filled-button onClick={() => setShowCreateRoom(true)}>+ 새 채팅방 추가</md-filled-button>
          </div>
        </aside>

        <main className="chat-area">
          <header className="chat-header">
            {currentRoom?.name ?? 'No chat'}
            {currentRoom && (
              <span className="chat-header-actions">
                {selectedRoomId != null && (
                  <>
                    <md-outlined-button
                      style={{ marginLeft: 'auto', height: '32px', fontSize: '12px' }}
                      onClick={() => { setEditRoomName(currentRoom.name); setShowEditRoom(true) }}
                    >
                      Rename
                    </md-outlined-button>
                    <md-outlined-button
                      style={{ marginLeft: '8px', height: '32px', fontSize: '12px' }}
                      onClick={() => void handleDeleteRoom()}
                    >
                      Delete
                    </md-outlined-button>
                  </>
                )}
              </span>
            )}
          </header>

          <div className="messages">
            {loadingMessages && <div className="message-state">Loading messages...</div>}
            {!loadingMessages && selectedRoomId == null && <div className="message-state">방을 선택하거나 새 방을 만들어보세요.</div>}
            {!loadingMessages && selectedRoomId != null && messages.length === 0 && <div className="message-state">메시지가 없습니다.</div>}

            {timeline.map((item) => item.kind === 'message' ? (
              <div key={item.key} className={'message ' + (item.data.user_name === me ? 'outgoing' : 'incoming')}>
                <div className="message-from">{item.data.user_name}</div>
                <div className="message-text">{translated[item.data.id] ?? item.data.message}</div>
              </div>
            ) : (
              <div key={item.key} className="system-event">
                {item.data.userName === me
                  ? `You ${item.data.kind === 'join' ? 'joined' : 'left'} the room`
                  : `${item.data.userName} ${item.data.kind === 'join' ? 'joined' : 'left'} the room`}
              </div>
            ))}
          </div>

          <section className="ai-panel">
            <div className="ai-panel-header">
              <div>
                <div className="ai-panel-title">AI 답변 추천</div>
                <div className="ai-panel-subtitle">대화 맥락을 보고 어떻게 답하면 좋을지 제안합니다.</div>
              </div>
              <md-outlined-button
                onClick={() => { if (selectedRoomId != null) void fetchAiSuggestions(selectedRoomId) }}
                disabled={selectedRoomId == null || loadingSuggestions}
              >
                {loadingSuggestions ? 'Loading...' : '새로고침'}
              </md-outlined-button>
            </div>

            {loadingSuggestions ? (
              <div className="message-state">추천을 불러오는 중...</div>
            ) : aiSuggestions.length === 0 ? (
              <div className="message-state">추천을 불러오려면 방을 선택하세요.</div>
            ) : (
              <div className="suggestion-list">
                {aiSuggestions.map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    className="suggestion-card"
                    onClick={() => void handleSuggestionClick(item)}
                    disabled={selectedRoomId == null || sending}
                  >
                    <div className="suggestion-index">{index + 1}</div>
                    <pre className="suggestion-body">{item}</pre>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="composer">
            <md-filled-text-field
              className="composer-input"
              placeholder={`Message #${currentRoom?.name ?? ''}`}
              value={input}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
              disabled={selectedRoomId == null || sending}
            />
            <md-filled-button onClick={() => void send()} disabled={selectedRoomId == null || sending}>
              {sending ? 'Sending...' : 'Send'}
            </md-filled-button>
          </div>
        </main>
      </div>
    </>
  )
}
