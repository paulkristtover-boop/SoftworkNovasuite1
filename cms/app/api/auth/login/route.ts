import { NextResponse } from 'next/server';
import { createSession, verifyPassword } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!verifyPassword(body.password || '')) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
    await createSession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
