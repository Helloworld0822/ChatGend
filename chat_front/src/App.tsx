import { useState, useEffect } from 'react'
import './App.css'
import './index.css'
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/checkbox/checkbox.js';
import { authFetch, getToken } from './auth'

type ChatSummary = { id: number; name: string; last: string }

const initialChats: ChatSummary[] = []

const LANG_KEY = 'preferred_language'
const AVAILABLE_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
]

export default function App() {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats)
  const [selected, setSelected] = useState<number>(1)
  const [input, setInput] = useState('')
  const [me, setMe] = useState<string | null>(null)
  const [preferredLang, setPreferredLang] = useState<string>(localStorage.getItem(LANG_KEY) || 'en')
  const [translated, setTranslated] = useState<Record<number, string>>({})

  // Registration modal state
  const [showRegister, setShowRegister] = useState<boolean>(() => !getToken())
  const [regName, setRegName] = useState<string>('')
  const [regLang, setRegLang] = useState<string>(preferredLang)
  const [regToken, setRegToken] = useState<string>('')

  useEffect(() => {
    authFetch('/auth/whoami').then(r => r.json()).then((data) => {
      setMe(data?.user?.display_name ?? data?.user?.token ?? null)
    }).catch(() => {})
  }, [])

  const currentChat = chats.find((c) => c.id === selected) ?? chats[0]
  const messages = [
    { id: 1, from: 'Alice', text: 'Hello!' },
    { id: 2, from: 'You', text: 'Hi, I am testing the new layout.' },
    { id: 3, from: 'Alice', text: 'Looks good.' },
  ]

  useEffect(() => {
    // Translate visible messages whenever preferredLang changes
    async function doTranslate() {
      const texts = messages.map((m) => m.text)
      try {
        const resp = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts, target: preferredLang })
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

    if (preferredLang) doTranslate()
  }, [preferredLang])

  function send() {
    if (!input.trim()) return
    setInput('')
  }

  function addChat() {
    const nextId = Math.max(...chats.map((c) => c.id), 0) + 1
    const newChat: ChatSummary = { id: nextId, name: `새 채팅 ${nextId}`, last: '' }
    setChats((prev) => [...prev, newChat])
    setSelected(nextId)
  }

  function changeLang(code: string) {
    setPreferredLang(code)
    localStorage.setItem(LANG_KEY, code)
  }

  function generateToken() {
    return 'tok_' + Math.random().toString(36).slice(2, 10)
  }

  async function handleRegister(e?: Event) {
    if (e && (e as any).preventDefault) (e as any).preventDefault()
    const tokenToUse = regToken || generateToken()

    try {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToUse, displayName: regName || tokenToUse })
      })

      // persist token and preferred language
      localStorage.setItem('persistent_user_token', tokenToUse)
      localStorage.setItem(LANG_KEY, regLang)
      setRegToken(tokenToUse)
      setPreferredLang(regLang)
      setShowRegister(false)
      // try to fetch whoami
      const resp = await fetch('/api/auth/whoami', { headers: { Authorization: `Bearer ${tokenToUse}` } })
      const json = await resp.json()
      setMe(json?.user?.display_name ?? tokenToUse)
    } catch (err) {
      console.error('register failed', err)
      alert('Registration failed: ' + err)
    }
  }

  return (
    <>
      {showRegister && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Welcome — register your name</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleRegister() }}>
              <div style={{ marginBottom: 8 }}>
                <label>Name: </label>
                <input value={regName} onChange={(e) => setRegName((e.target as HTMLInputElement).value)} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>Language: </label>
                <select value={regLang} onChange={(e) => setRegLang((e.target as HTMLSelectElement).value)}>
                  {AVAILABLE_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>Token (optional): </label>
                <input placeholder="auto-generate if empty" value={regToken} onChange={(e) => setRegToken((e.target as HTMLInputElement).value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit">Register</button>
                <button type="button" onClick={() => { const t = generateToken(); setRegToken(t); setRegName(''); setRegLang(preferredLang) }}>Generate Token</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">Chats</div>
        <div style={{ padding: '8px', fontSize: '12px', color: '#666' }}>Me: {me ?? 'unknown'}</div>

        <div style={{ padding: '8px' }}>
          <label style={{ fontSize: '12px' }}>Language:</label>
          <select value={preferredLang} onChange={(e) => changeLang((e.target as HTMLSelectElement).value)} style={{ marginLeft: 8 }}>
            {AVAILABLE_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>

        <ul className="chat-list">
          {chats.map((c) => (
            <li
              key={c.id}
              className={"chat-item " + (c.id === selected ? 'active' : '')}
              onClick={() => setSelected(c.id)}
            >
              <div className="chat-name">{c.name}</div>
              <div className="chat-last">{c.last}</div>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <button className="add-chat" onClick={addChat}>+ 새 채팅방 추가</button>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">{currentChat?.name ?? 'No chat'}</header>

        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={"message " + (m.from === 'You' ? 'outgoing' : 'incoming')}>
              <div className="message-from">{m.from}</div>
              <div className="message-text">{translated[m.id] ?? m.text}</div>
            </div>
          ))}
        </div>

        <div className="composer">
          <input
            className="composer-input"
            placeholder={`Message #${currentChat?.name ?? ''}`}
            value={input}
            onChange={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          />
          <button className="composer-send" onClick={send}>Send</button>
        </div>
      </main>
    </div>
    </>
  )
}
