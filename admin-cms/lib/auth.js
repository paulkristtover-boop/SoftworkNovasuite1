import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { randomBytes, timingSafeEqual } from 'crypto';
import { query } from './db';

const COOKIE = 'novasuite_cms';

function getSecret() {
  const s = process.env.ADMIN_CMS_SECRET;
  if (!s || String(s).length < 16) {
    throw new Error('ADMIN_CMS_SECRET missing or shorter than 16 characters');
  }
  return new TextEncoder().encode(String(s));
}

function maxAgeSec() {
  const h = parseInt(process.env.SESSION_MAX_AGE_HOURS || '8', 10);
  return (Number.isFinite(h) && h > 0 ? h : 8) * 3600;
}

async function ensureSessionsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS cms_sessions (
      id VARCHAR(64) PRIMARY KEY,
      admin_label VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      ip VARCHAR(45),
      user_agent TEXT,
      revoked BOOLEAN DEFAULT FALSE
    )
  `);
}

export async function createSession(ip, userAgent) {
  const sessionId = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + maxAgeSec() * 1000);

  try {
    await ensureSessionsTable();
    await query(
      `INSERT INTO cms_sessions (id, admin_label, expires_at, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        sessionId,
        process.env.ADMIN_CMS_USERNAME || 'admin',
        expires.toISOString(),
        ip ? String(ip).slice(0, 45) : null,
        userAgent ? String(userAgent).slice(0, 500) : null,
      ]
    );
  } catch (err) {
    console.error('[cms] session row insert:', err.message);
  }

  const token = await new SignJWT({
    sid: sessionId,
    role: 'admin',
    sub: process.env.ADMIN_CMS_USERNAME || 'admin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(1, Math.floor(maxAgeSec() / 3600))}h`)
    .sign(getSecret());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSec(),
  });
}

export async function destroySession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      if (payload.sid) {
        await query(`UPDATE cms_sessions SET revoked=TRUE WHERE id=$1`, [payload.sid]).catch(() => {});
      }
    } catch (_) {}
  }
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function getSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload || null;
  } catch {
    return null;
  }
}

export function verifyPassword(input) {
  const expected = process.env.ADMIN_CMS_PASSWORD;
  if (!expected) throw new Error('ADMIN_CMS_PASSWORD is not set');
  if (!input) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
