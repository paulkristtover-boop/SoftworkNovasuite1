import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await destroySession();
  } catch (e) {
    console.error('[cms logout]', e);
  }
  return NextResponse.json({ ok: true });
}
