import { NextResponse } from 'next/server';
import { createSession, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    if (!process.env.ADMIN_CMS_SECRET || String(process.env.ADMIN_CMS_SECRET).length < 16) {
      return NextResponse.json(
        { error: 'Misconfigured: set ADMIN_CMS_SECRET (≥16 chars) on Vercel' },
        { status: 500 }
      );
    }
    if (!process.env.ADMIN_CMS_PASSWORD) {
      return NextResponse.json(
        { error: 'Misconfigured: set ADMIN_CMS_PASSWORD on Vercel' },
        { status: 500 }
      );
    }
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: 'Misconfigured: set DATABASE_URL on Vercel (same Postgres as the bot)' },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!verifyPassword(body.password || '')) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
    const ua = req.headers.get('user-agent') || '';
    await createSession(ip, ua);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[cms login]', e);
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
