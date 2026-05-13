import { useState } from 'react'
import './App.css'
import './index.css'
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/checkbox/checkbox.js';

type ChatSummary = { id: number; name: string; last: string }

const initialChats: ChatSummary[] = [
  { id: 1, name: 'General', last: 'Hey — how are you?' },
  { id: 2, name: 'Project X', last: 'Design updated' },
  { id: 3, name: 'Random', last: 'Funny meme' },
]

export default function App() {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats)
  const [selected, setSelected] = useState<number>(1)
  const [input, setInput] = useState('')

  const currentChat = chats.find((c) => c.id === selected) ?? chats[0]
  const messages = [
    { id: 1, from: 'Alice', text: 'Hello!' },
    { id: 2, from: 'You', text: 'Hi, I am testing the new layout.' },
    { id: 3, from: 'Alice', text: 'Looks good.' },
  ]

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

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">Chats</div>
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
              <div className="message-text">{m.text}</div>
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
  )
}