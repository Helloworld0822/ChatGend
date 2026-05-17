import { query } from './db'

export async function createRoom(name: string, inviteHash?: string, creatorToken?: string) {
  const res = await query('INSERT INTO chat_room(name, invite_hash, creator_token) VALUES($1, $2, $3) RETURNING id, name, invite_hash, creator_token', [name, inviteHash ?? null, creatorToken ?? null])
  return res.rows?.[0]
}

export async function getRoomById(id: number) {
  const res = await query('SELECT id, name, invite_hash FROM chat_room WHERE id = $1', [id])
  return res.rows?.[0] ?? null
}

export async function getRoomByInviteHash(inviteHash: string) {
  const res = await query('SELECT id, name, invite_hash FROM chat_room WHERE invite_hash = $1', [inviteHash])
  return res.rows?.[0] ?? null
}

export async function addMessage(roomId: number, userName: string, authorToken: string | null, message: string) {
  const res = await query('INSERT INTO chat(room_id, user_name, author_token, message) VALUES($1, $2, $3, $4) RETURNING id, room_id, user_name, author_token, message, created_at', [roomId, userName, authorToken, message])
  return res.rows?.[0]
}

export async function listMessages(roomId: number, limit = 100) {
  const res = await query('SELECT id, room_id, user_name, author_token, message, created_at FROM chat WHERE room_id = $1 ORDER BY id ASC LIMIT $2', [roomId, limit])
  return res.rows ?? []
}

export async function findMessage(messageId: number) {
  const res = await query('SELECT id, room_id, user_name, author_token, message, created_at FROM chat WHERE id = $1', [messageId])
  return res.rows?.[0] ?? null
}

export async function deleteMessage(messageId: number) {
  await query('DELETE FROM chat WHERE id = $1', [messageId])
  return { ok: true }
}
