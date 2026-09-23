import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../lib/auth';
import * as data from '../../../lib/data';

export async function GET(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') || 'pending';
  const list = status === 'pending' ? await data.listPendingWithdrawals() : await data.listWithdrawals(status);
  return NextResponse.json(list);
}

export async function POST(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  try {
    if (body.action === 'pay') {
      await data.markWithdrawalPaid(body.id, body.note);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'reject') {
      await data.rejectWithdrawal(body.id, body.note);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
