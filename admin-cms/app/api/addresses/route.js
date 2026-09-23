import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../lib/auth';
import * as data from '../../../lib/data';

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await data.listAddresses());
}

export async function POST(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  try {
    if (body.action === 'add') return NextResponse.json(await data.addAddress(body));
    if (body.action === 'toggle') return NextResponse.json(await data.toggleAddress(body.id));
    if (body.action === 'delete') {
      await data.deleteAddress(body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
