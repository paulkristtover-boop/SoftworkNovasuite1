import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { query } from './db';
import crypto from 'crypto';

const COOKIE = 'novasuite_cms';

function secret() {
  const s = process.env.ADMIN_CMS_SECRET;
  if (!s || s.length < 16) throw new Error('ADMIN_CMS_SECRET must be set (≥16 chars)');
  return new TextEncoder().encode(s);
}

function maxAgeSec() {
  const h = parseInt(process.env.SESSION_MAX_AGE_HOURS || '8', 10);
  return h * 3600;
}

export async function createSession(ip, userAgent) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + maxAgeSec() * 1000);
  await query(
    `INSERT INTO cms_sessions (id, admin_label, expires_at, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5)`,
    [sessionId, process.env.ADMIN_CMS_USERNAME || 'admin', expires.toISOString(), ip || null, userAgent || null]
  );
  const token = await new SignJWT({ sid: sessionId, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${Math.floor(maxAgeSec() / 3600)}h`)
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSec(),
  });
}

export async function destroySession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      if (payload.sid) {
        await query(`UPDATE cms_sessions SET revoked=TRUE WHERE id=$1`, [payload.sid]);
      }
    } catch (_) {}
  }
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function getSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sid) return null;
    const res = await query(
      `SELECT * FROM cms_sessions WHERE id=$1 AND revoked=FALSE AND expires_at > NOW()`,
      [payload.sid]
    );
    if (!res.rows[0]) return null;
    await query(`UPDATE cms_sessions SET last_seen_at=NOW() WHERE id=$1`, [payload.sid]);
    return payload;
  } catch {
    return null;
  }
}

export function verifyPassword(input) {
  const expected = process.env.ADMIN_CMS_PASSWORD || '';
  if (!expected || !input) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
