import { randomUUID } from 'node:crypto'
import { query } from './db.js'

export type ChatRoom = {
  id: number
  name: string
  invite_hash: string | null
  creator_token: string | null
  created_at: string
}

export type ChatRoomSummary = ChatRoom & {
  last_message: string
  message_count: number
}

export type ChatMessage = {
  id: number
  room_id: number
  user_name: string
  author_token: string | null
  message: string
  created_at: string
}

export type PublicRoom = Omit<ChatRoom, 'creator_token'>
export type PublicRoomSummary = Omit<ChatRoomSummary, 'creator_token'>
export type PublicMessage = Omit<ChatMessage, 'author_token'>

export async function createRoom(name: string, inviteHash?: string, creatorToken?: string): Promise<ChatRoom> {
  const finalInviteHash = inviteHash?.trim() || randomUUID()
  const res = await query(
    'INSERT INTO chat_room(name, invite_hash, creator_token) VALUES($1, $2, $3) RETURNING id, name, invite_hash, creator_token, created_at',
    [name, finalInviteHash, creatorToken ?? null],
  )
  return res.rows?.[0] as ChatRoom
}

export async function getRoomSummary(id: number): Promise<ChatRoomSummary | null> {
  const res = await query(
    `SELECT
      r.id,
      r.name,
      r.invite_hash,
      r.creator_token,
      r.created_at,
      COALESCE(m.message, '') AS last_message,
      COALESCE(cnt.message_count, 0)::int AS message_count
    FROM chat_room r
    LEFT JOIN LATERAL (
      SELECT message
      FROM chat c
      WHERE c.room_id = r.id
      ORDER BY c.id DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS message_count
      FROM chat c
      WHERE c.room_id = r.id
    ) cnt ON true
    WHERE r.id = $1`,
    [id],
  )
  return (res.rows?.[0] as ChatRoomSummary | undefined) ?? null
}

export async function listRooms(limit = 50): Promise<ChatRoomSummary[]> {
  const res = await query(
    `SELECT
      r.id,
      r.name,
      r.invite_hash,
      r.creator_token,
      r.created_at,
      COALESCE(m.message, '') AS last_message,
      COALESCE(cnt.message_count, 0)::int AS message_count
    FROM chat_room r
    LEFT JOIN LATERAL (
      SELECT message
      FROM chat c
      WHERE c.room_id = r.id
      ORDER BY c.id DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS message_count
      FROM chat c
      WHERE c.room_id = r.id
    ) cnt ON true
    ORDER BY r.id DESC
    LIMIT $1`,
    [limit],
  )
  return (res.rows ?? []) as ChatRoomSummary[]
}

export async function getRoomById(id: number): Promise<ChatRoom | null> {
  const res = await query('SELECT id, name, invite_hash, creator_token, created_at FROM chat_room WHERE id = $1', [id])
  return (res.rows?.[0] as ChatRoom | undefined) ?? null
}

export async function getRoomByInviteHash(inviteHash: string): Promise<ChatRoom | null> {
  const res = await query('SELECT id, name, invite_hash, creator_token, created_at FROM chat_room WHERE invite_hash = $1', [inviteHash])
  return (res.rows?.[0] as ChatRoom | undefined) ?? null
}

export async function updateRoom(id: number, name: string): Promise<ChatRoom | null> {
  const res = await query(
    'UPDATE chat_room SET name = $2 WHERE id = $1 RETURNING id, name, invite_hash, creator_token, created_at',
    [id, name],
  )
  return (res.rows?.[0] as ChatRoom | undefined) ?? null
}

export async function deleteRoom(id: number): Promise<{ ok: true }> {
  const res = await query('DELETE FROM chat_room WHERE id = $1 RETURNING id', [id])
  return (res.rows?.[0] ?? { ok: true }) as { ok: true }
}

export async function addMessage(roomId: number, userName: string, authorToken: string | null, message: string): Promise<ChatMessage> {
  const res = await query(
    'INSERT INTO chat(room_id, user_name, author_token, message) VALUES($1, $2, $3, $4) RETURNING id, room_id, user_name, author_token, message, created_at',
    [roomId, userName, authorToken, message],
  )
  return res.rows?.[0] as ChatMessage
}

export async function listMessages(roomId: number, limit = 100): Promise<ChatMessage[]> {
  const res = await query(
    'SELECT id, room_id, user_name, author_token, message, created_at FROM chat WHERE room_id = $1 ORDER BY id ASC LIMIT $2',
    [roomId, limit],
  )
  return (res.rows ?? []) as ChatMessage[]
}

export async function findMessage(messageId: number): Promise<ChatMessage | null> {
  const res = await query('SELECT id, room_id, user_name, author_token, message, created_at FROM chat WHERE id = $1', [messageId])
  return (res.rows?.[0] as ChatMessage | undefined) ?? null
}

export async function updateMessage(messageId: number, message: string): Promise<ChatMessage | null> {
  const res = await query(
    'UPDATE chat SET message = $2 WHERE id = $1 RETURNING id, room_id, user_name, author_token, message, created_at',
    [messageId, message],
  )
  return (res.rows?.[0] as ChatMessage | undefined) ?? null
}

export async function deleteMessage(messageId: number): Promise<{ ok: true }> {
  await query('DELETE FROM chat WHERE id = $1', [messageId])
  return { ok: true }
}

export async function addMember(roomId: number, userToken: string): Promise<void> {
  await query(
    'INSERT INTO room_members(room_id, user_token) VALUES($1, $2) ON CONFLICT DO NOTHING',
    [roomId, userToken],
  )
}

export async function isMember(roomId: number, userToken: string): Promise<boolean> {
  const res = await query(
    'SELECT 1 FROM room_members WHERE room_id = $1 AND user_token = $2',
    [roomId, userToken],
  )
  return (res.rowCount ?? 0) > 0
}

export async function listUserRooms(userToken: string, limit = 50): Promise<ChatRoomSummary[]> {
  const res = await query(
    `SELECT
      r.id,
      r.name,
      r.invite_hash,
      r.created_at,
      COALESCE(m.message, '') AS last_message,
      COALESCE(cnt.message_count, 0)::int AS message_count
    FROM chat_room r
    INNER JOIN room_members rm ON rm.room_id = r.id AND rm.user_token = $1
    LEFT JOIN LATERAL (
      SELECT message
      FROM chat c
      WHERE c.room_id = r.id
      ORDER BY c.id DESC
      LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS message_count
      FROM chat c
      WHERE c.room_id = r.id
    ) cnt ON true
    ORDER BY r.id DESC
    LIMIT $2`,
    [userToken, limit],
  )
  return (res.rows ?? []) as ChatRoomSummary[]
}
