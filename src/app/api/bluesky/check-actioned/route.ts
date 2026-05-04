import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dids } = await req.json();
  if (!Array.isArray(dids) || dids.length === 0) {
    return NextResponse.json({ blocked: [], muted: [] });
  }

  const rows = await query<{ target_did: string; action: string }>(
    `SELECT DISTINCT target_did, action FROM block_events WHERE user_id = $1 AND target_did = ANY($2)`,
    [userId, dids]
  );

  const blocked = rows.filter((r) => r.action === 'block').map((r) => r.target_did);
  const muted = rows.filter((r) => r.action === 'mute').map((r) => r.target_did);

  return NextResponse.json({ blocked, muted });
}
