import 'dotenv/config'
import { query } from './db.js'

const SEED_USERS = [
  { token: 'seed-token-alice', display_name: 'Alice' },
  { token: 'seed-token-bob', display_name: 'Bob' },
  { token: 'seed-token-charlie', display_name: 'Charlie' },
]

const SEED_ROOMS = [
  {
    name: '🌐 General Chat',
    invite_hash: 'seed-general-chat',
    creator_token: 'seed-token-alice',
    messages: [
      { user: 'Alice', token: 'seed-token-alice', text: 'Hey everyone! Welcome to the new chat app 🎉' },
      { user: 'Bob', token: 'seed-token-bob', text: 'Nice! The UI looks really clean with the new design.' },
      { user: 'Alice', token: 'seed-token-alice', text: 'Totally agree, the gradients are beautiful.' },
      { user: 'Charlie', token: 'seed-token-charlie', text: 'Is the WebSocket working stable now?' },
      { user: 'Alice', token: 'seed-token-alice', text: 'Yep, we fixed the nginx config — Upgrade headers and everything.' },
      { user: 'Bob', token: 'seed-token-bob', text: 'Great, real-time messaging feels so smooth.' },
    ],
  },
  {
    name: '📱 Project Alpha',
    invite_hash: 'seed-project-alpha',
    creator_token: 'seed-token-alice',
    messages: [
      { user: 'Alice', token: 'seed-token-alice', text: 'Let\'s discuss the roadmap for Q3.' },
      { user: 'Bob', token: 'seed-token-bob', text: 'I think we should prioritize the AI recommendation feature.' },
      { user: 'Charlie', token: 'seed-token-charlie', text: 'Agreed, the suggestion cards are a great start but need refinement.' },
      { user: 'Alice', token: 'seed-token-alice', text: 'What about the language translation feature? Any update?' },
      { user: 'Bob', token: 'seed-token-bob', text: 'Translation API is integrated now. Works with Google Translate.' },
      { user: 'Alice', token: 'seed-token-alice', text: 'Awesome. Let\'s demo it in the next sprint review.' },
    ],
  },
  {
    name: '🤖 AI Discussion',
    invite_hash: 'seed-ai-discussion',
    creator_token: 'seed-token-charlie',
    messages: [
      { user: 'Charlie', token: 'seed-token-charlie', text: 'Anyone tried the new OpenAI API updates?' },
      { user: 'Alice', token: 'seed-token-alice', text: 'Yeah, the new models are impressive. Much faster inference.' },
      { user: 'Bob', token: 'seed-token-bob', text: 'I\'ve been testing GPT-4.7 for code generation. It\'s scary good.' },
      { user: 'Charlie', token: 'seed-token-charlie', text: 'How are we handling rate limits in production?' },
      { user: 'Alice', token: 'seed-token-alice', text: 'We should add a queue system. Maybe Redis-backed.' },
      { user: 'Bob', token: 'seed-token-bob', text: 'Good idea. Also need to cache common responses.' },
    ],
  },
  {
    name: '🎨 Design Feedback',
    invite_hash: 'seed-design-feedback',
    creator_token: 'seed-token-bob',
    messages: [
      { user: 'Bob', token: 'seed-token-bob', text: 'The new MD3 design is looking great on desktop.' },
      { user: 'Alice', token: 'seed-token-alice', text: 'We should also optimize for mobile. The sidebar collapses nicely.' },
      { user: 'Charlie', token: 'seed-token-charlie', text: 'Dark mode support is solid now. The Gemini gradients work well in both themes.' },
      { user: 'Bob', token: 'seed-token-bob', text: 'Let\'s add more responsive breakpoints for tablets.' },
    ],
  },
]

async function seed() {
  console.log('🌱 Seeding database...')

  // ── Users ──
  console.log('  👤 Users...')
  for (const u of SEED_USERS) {
    await query(
      `INSERT INTO users (token, display_name) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING`,
      [u.token, u.display_name],
    )
  }

  // ── Rooms + Messages + Members ──
  for (const room of SEED_ROOMS) {
    console.log(`  🏠 Room "${room.name}"...`)

    // Upsert room by invite_hash (has unique index)
    const r = await query(
      `INSERT INTO chat_room (name, invite_hash, creator_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (invite_hash) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [room.name, room.invite_hash, room.creator_token],
    )
    const roomId: number = r.rows[0].id

    // Insert messages (delete existing seed messages first to avoid duplicates on re-run)
    await query(`DELETE FROM chat WHERE room_id = $1`, [roomId])
    for (const msg of room.messages) {
      await query(
        `INSERT INTO chat (room_id, user_name, author_token, message)
         VALUES ($1, $2, $3, $4)`,
        [roomId, msg.user, msg.token, msg.text],
      )
    }

    // Add room members
    const memberTokens = [...new Set(room.messages.map(m => m.token))]
    for (const token of memberTokens) {
      await query(
        `INSERT INTO room_members (room_id, user_token) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roomId, token],
      )
    }
  }

  console.log('✅ Seed complete!')
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
