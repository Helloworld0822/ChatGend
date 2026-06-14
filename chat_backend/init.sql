-- PostgreSQL-compatible schema for this project

CREATE TABLE IF NOT EXISTS chat_room (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  invite_hash TEXT,
  creator_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_room_invite_hash_idx ON chat_room(invite_hash);

CREATE TABLE IF NOT EXISTS users (
  token TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  author_token TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_room_id_idx ON chat(room_id);

CREATE TABLE IF NOT EXISTS room_members (
  room_id BIGINT NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  user_token TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_token)
);

CREATE INDEX IF NOT EXISTS room_members_user_idx ON room_members(user_token);

CREATE TABLE IF NOT EXISTS user (
    name TEXT NOT NULL,
    token TEXT PRIMARY KEY,
    language TEXT NOT NULL
);
