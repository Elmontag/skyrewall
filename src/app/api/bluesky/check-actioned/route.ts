import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUserId, isValidDid } from '@/lib/session';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = checkApiRateLimit(req, {
    scope: 'bluesky:check-actioned',
    identity: userId,
    limit: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  const { dids } = await req.json();
  if (!Array.isArray(dids) || dids.length === 0) {
    return NextResponse.json({ blocked: [], muted: [] });
  }
  if (dids.length > MAX_DIDS || !dids.every(isValidDid)) {
    return NextResponse.json({ error: 'Invalid dids' }, { status: 400 });
  }

  const rows = await query<{ target_did: string; action: string }>(
    `SELECT DISTINCT target_did, action FROM block_events WHERE user_id = $1 AND target_did = ANY($2)`,
    [userId, dids]
  );

  const blocked = rows.filter((r) => r.action === 'block').map((r) => r.target_did);
  const muted = rows.filter((r) => r.action === 'mute').map((r) => r.target_did);

  return NextResponse.json({ blocked, muted });
}
