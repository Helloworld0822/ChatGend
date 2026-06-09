import { useState, useEffect } from 'react'
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

type ChatSummary = { id: number; name: string; last: string }

const LANG_KEY = 'preferred_language'
const AVAILABLE_LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
]

const DUMMY_MESSAGES = [
  { id: 1, from: 'Alice', text: 'Hello!' },
  { id: 2, from: 'You', text: 'Hi, I am testing the new layout.' },
  { id: 3, from: 'Alice', text: 'Looks good.' },
]

export default function App() {
  const [chats, setChats] = useState<ChatSummary[]>([])
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
  useEffect(() => {
    // Translate visible messages whenever preferredLang changes
    async function doTranslate() {
      const texts = DUMMY_MESSAGES.map((m) => m.text)
      try {
        const resp = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts, target: preferredLang })
        })
        const json = await resp.json()
        if (json?.translations && Array.isArray(json.translations)) {
          const map: Record<number, string> = {}
          DUMMY_MESSAGES.forEach((m, i) => { map[m.id] = json.translations[i] })
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

  async function handleRegister(e?: React.FormEvent | Event) {
    if (e && 'preventDefault' in e) e.preventDefault()
    const tokenToUse = regToken || generateToken()

    try {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToUse, displayName: regName || tokenToUse })
      })

      // persist token and preferred language
      setToken(tokenToUse)
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
        <md-dialog open>
          <div slot="headline">Welcome — register your name</div>
          <form slot="content" onSubmit={(e) => { e.preventDefault(); handleRegister() }}>
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
            <md-filled-button onClick={() => handleRegister()}>Register</md-filled-button>
            <md-outlined-button onClick={() => { const t = generateToken(); setRegToken(t); setRegName(''); setRegLang(preferredLang) }}>Generate Token</md-outlined-button>
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

        <md-list>
          {chats.map((c) => (
            <md-list-item
              key={c.id}
              onClick={() => setSelected(c.id)}
              selected={c.id === selected}
            >
              <div slot="headline">{c.name}</div>
              <div slot="supporting-text">{c.last}</div>
            </md-list-item>
          ))}
        </md-list>

        <div className="sidebar-footer">
          <md-filled-button onClick={addChat}>+ 새 채팅방 추가</md-filled-button>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">{currentChat?.name ?? 'No chat'}</header>

        <div className="messages">
          {DUMMY_MESSAGES.map((m) => (
            <div key={m.id} className={"message " + (m.from === 'You' ? 'outgoing' : 'incoming')}>
              <div className="message-from">{m.from}</div>
              <div className="message-text">{translated[m.id] ?? m.text}</div>
            </div>
          ))}
        </div>

        <div className="composer">
          <md-filled-text-field
            className="composer-input"
            placeholder={`Message #${currentChat?.name ?? ''}`}
            value={input}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          />
          <md-filled-button onClick={send}>Send</md-filled-button>
        </div>
      </main>
    </div>
    </>
  )
}
