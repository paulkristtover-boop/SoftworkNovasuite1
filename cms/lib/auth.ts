import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = 'novasuite_admin';

function secret() {
  const s = process.env.ADMIN_CMS_SECRET;
  if (!s) throw new Error('ADMIN_CMS_SECRET is required');
  return new TextEncoder().encode(s);
}

export async function createSession() {
  const token = await new SignJWT({
    role: 'admin',
    username: process.env.ADMIN_CMS_USERNAME || 'admin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function getSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

export function verifyPassword(input: string) {
  const expected = process.env.ADMIN_CMS_PASSWORD || '';
  return expected.length > 0 && input === expected;
}
