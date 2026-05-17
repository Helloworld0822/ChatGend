CREATE TABLE IF NOT EXISTS chat_room (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_hash TEXT PRIMARY KEY,
    key room_id_index(id)
);

CREATE TABLE IF NOT EXISTS chat (
    room_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    message TEXT NOT NULL,
    user_list TEXT[],
);

CREATE TABLE If NOT EXISTS user (
    name TEXT NOT NULL,
    token TEXT PRIMARY KEY
);