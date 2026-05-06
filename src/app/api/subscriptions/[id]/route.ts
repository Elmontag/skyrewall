import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';

async function getUserId(): Promise<string | null> {
  return getSessionUserId();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = checkApiRateLimit(req, {
    scope: 'subscriptions:patch',
    identity: userId,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Only supported patch: clear paused_reason to re-enable a paused subscription
  if ('paused_reason' in body && body.paused_reason === null) {
    await query(
      'UPDATE subscriptions SET paused_reason = NULL WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unsupported patch' }, { status: 400 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = checkApiRateLimit(req, {
    scope: 'subscriptions:delete',
    identity: userId,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  const { id } = await params;

  await query(
    'DELETE FROM subscriptions WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  return NextResponse.json({ success: true });
}
