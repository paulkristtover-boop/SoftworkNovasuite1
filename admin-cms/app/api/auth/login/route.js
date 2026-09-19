import { NextResponse } from 'next/server';
import { createSession, verifyPassword } from '@/lib/auth';

export async function POST(req) {
  try {
    const body = await req.json();
    if (!verifyPassword(body.password || '')) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
    const ua = req.headers.get('user-agent') || '';
    await createSession(ip, ua);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
