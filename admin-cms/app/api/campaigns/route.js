import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../lib/auth';
import * as data from '../../../lib/data';

export async function GET(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') || 'pending';
  return NextResponse.json(await data.listCampaigns(status));
}

export async function POST(req) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  try {
    if (body.action === 'approve') {
      await data.approveCampaign(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'reject') {
      await data.rejectCampaign(body.id, body.note);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'pause') {
      await data.pauseCampaign(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'resume') {
      await data.resumeCampaign(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'boost') {
      await data.boostCampaign(body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
