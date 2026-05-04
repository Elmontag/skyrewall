import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { isValidDid } from '@/lib/session';
import { query } from '@/lib/db';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ did: string }> }) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = checkApiRateLimit(req, {
    scope: 'whitelist:delete',
    identity: userId,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  const { did } = await params;
  const decodedDid = decodeURIComponent(did);
  if (!isValidDid(decodedDid)) {
    return NextResponse.json({ error: 'Invalid DID' }, { status: 400 });
  }

  const result = await query<{ id: string }>(
    `DELETE FROM whitelists WHERE user_id = $1 AND target_did = $2 RETURNING id`,
    [userId, decodedDid]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
