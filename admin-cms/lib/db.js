import { Pool } from 'pg';

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return new Pool({
    connectionString: url,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    max: 12,
  });
}

const g = globalThis;
export const pool = g.__novasuitePool || createPool();
if (process.env.NODE_ENV !== 'production') g.__novasuitePool = pool;

export async function query(text, params) {
  return pool.query(text, params);
}
