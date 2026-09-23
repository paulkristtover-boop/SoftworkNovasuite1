import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../lib/auth';
import * as data from '../../../lib/data';

export async function GET(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') || 'all';
  return NextResponse.json(await data.listIdeas(status));
}

export async function POST(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  try {
    await data.updateIdeaStatus(body.id, body.status, body.reply);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
