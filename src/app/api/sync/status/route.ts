import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { syncState } from '@/lib/sync-state';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    intervalMinutes: syncState.intervalMinutes,
    nextRunAt: syncState.nextRunAt?.toISOString() ?? null,
    lastRunAt: syncState.lastRunAt?.toISOString() ?? null,
  });
}
