import { NextResponse } from 'next/server';
import { isAuthenticated } from '../../../lib/auth';
import * as data from '../../../lib/data';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const stats = await data.getDashboard();
  return NextResponse.json(stats);
}
