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

  if ('config' in body && typeof body.config === 'object' && body.config !== null) {
    const allowedConfigKeys = ['protect_mutuals', 'protect_followings', 'add_to_list_uri'] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowedConfigKeys) {
      if (!(key in body.config)) continue;
      const val = (body.config as Record<string, unknown>)[key];
      if (key === 'add_to_list_uri' && typeof val === 'string' && !val.startsWith('at://')) {
        return NextResponse.json({ error: 'Invalid list URI format' }, { status: 400 });
      }
      patch[key] = val;
    }
    if (Object.keys(patch).length > 0) {
      await query(
        "UPDATE subscriptions SET config = COALESCE(config, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND user_id = $3",
        [JSON.stringify(patch), id, userId]
      );
      return NextResponse.json({ success: true });
    }
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
