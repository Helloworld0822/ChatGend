# AGENTS.md

## Cursor Cloud specific instructions

ChatGend is an AI-powered real-time chat app: a **Hono/Node (TypeScript)** backend (`chat_backend/`, WebSocket + Postgres) and a **React + Vite** frontend (`chat_front/`). Standard commands are in each subproject's `package.json`.

The Cloud Agent VM already has Node 22, PostgreSQL 16, and nginx installed. The update script refreshes `chat_backend` and `chat_front` node_modules. It does **not** start services.

### Running the app (dev)
- Start infra once per session: `sudo service postgresql start`. A `chatuser`/`chatpass`-owned `chatdb` database (schema from `chat_backend/init.sql`) already exists in the snapshot.
- Backend env is `chat_backend/.env` (gitignored, present in snapshot): `DATABASE_URL=postgres://chatuser:chatpass@localhost:5432/chatdb`, `PORT=3001`.
- Backend: `cd chat_backend && npm run dev` (tsx watch, listens on **:3001**).
- Frontend: `cd chat_front && npm run dev -- --host 0.0.0.0 --port 5273 --strictPort` (Vite on **:5273**).
- Access the full app through nginx at **http://localhost:18080** (`sudo service nginx start`; config at `/etc/nginx/sites-available/chatgend-dev.conf`).
- Checks (match CI): backend `npx tsc --noEmit` and `npm run build`; frontend `npx vite build`. There are no automated tests.

### Non-obvious caveats
- The frontend hard-codes `/api/...` paths and the WS at `/api/ws`, but the backend serves routes **unprefixed** (`/rooms`, `/ws`). The `/api` prefix is stripped by nginx (as in production `docker-compose`), so you must go through nginx (:18080), not hit Vite (:5273) directly, for the app to work end-to-end.
- The backend default port is 3000, but it is set to **3001** here to avoid colliding with the `rental_web` Elixir backend (which hard-codes :3000). Keep ChatGend on 3001 and rental_web_back on 3000 when running both. The chatgend nginx config points `/api` at 3001.
- `chat_front` `npm run lint` currently reports pre-existing `no-explicit-any` errors in committed code; lint is not part of CI (CI builds instead).
- OpenAI / Google Translate features need API keys (unset by default); chat + rooms work without them.
