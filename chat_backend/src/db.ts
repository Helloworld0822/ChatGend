import pg from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;

if (!connectionString) {
  console.warn('WARNING: No DATABASE_URL or PG_CONNECTION_STRING found in environment; set DATABASE_URL to connect to PostgreSQL.');
}

const { Pool } = pg;

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

// Run SQL from an init file (default: ../init.sql) inside a transaction.
export async function initDbFromFile(initFilePath?: string) {
  const filePath = initFilePath || path.resolve(__dirname, '../init.sql');
  if (!fs.existsSync(filePath)) {
    throw new Error(`init SQL file not found: ${filePath}`);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Split statements by semicolon while being tolerant of $$, functions, etc.
    // For simplicity we use a single query call which supports multiple statements when semicolons are present.
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function ping() {
  const res = await pool.query('SELECT 1 as ok');
  return res.rows?.[0]?.ok === 1;
}

export async function closePool() {
  await pool.end();
}

export default {
  pool,
  query,
  initDbFromFile,
  ping,
  closePool,
};