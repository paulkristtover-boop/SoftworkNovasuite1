import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../lib/auth';
import * as data from '../../../lib/data';

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await data.listUsers());
}

export async function POST(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  try {
    if (body.action === 'ban') {
      await data.banUser(body.id, body.reason);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'unban') {
      await data.unbanUser(body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
