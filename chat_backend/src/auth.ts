import { query } from './db'

export const registerToken = async (token: string, displayName?: string) => {
  const text = `INSERT INTO users(token, display_name) VALUES($1, $2) ON CONFLICT (token) DO NOTHING`;
  await query(text, [token, displayName ?? null]);
}

export const findUserByToken = async (token: string) => {
  const res = await query('SELECT token, display_name, created_at FROM users WHERE token = $1', [token]);
  return res.rows?.[0] ?? null;
}

export default { registerToken, findUserByToken };
