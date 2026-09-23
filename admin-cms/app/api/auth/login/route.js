import { NextResponse } from 'next/server';
import { createSession, COOKIE } from '../../../../lib/auth';

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const password = body.password || '';
  if (password !== process.env.ADMIN_CMS_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const token = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
