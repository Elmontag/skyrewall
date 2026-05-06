import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';
import { checkApiRateLimit, rejectCrossOrigin, isValidAtUri } from '@/lib/request-security';

interface SubscriptionRow {
  id: string;
  target_handle: string;
  mode: string;
  sub_type: string;
  include_followers: boolean;
  config: Record<string, unknown>;
  last_updated: string | null;
  created_at: string;
  paused_reason: string | null;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscriptions = await query<SubscriptionRow>(
    'SELECT id, target_handle, mode, sub_type, include_followers, config, last_updated, created_at, paused_reason FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return NextResponse.json({ subscriptions });
}

export async function POST(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = checkApiRateLimit(req, {
    scope: 'subscriptions:post',
    identity: userId,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  try {
    const { target_handle, mode, include_followers, sub_type = 'follower', config = {} } = await req.json();
    if (!target_handle || !mode) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!['block', 'mute'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }
    if (!['follower', 'reblock', 'postinteraction', 'list'].includes(sub_type)) {
      return NextResponse.json({ error: 'Invalid sub_type' }, { status: 400 });
    }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      return NextResponse.json({ error: 'Invalid config' }, { status: 400 });
    }
    if (sub_type === 'list') {
      const listUri = (config as Record<string, unknown>).list_uri;
      if (typeof listUri !== 'string' || !isValidAtUri(listUri)) {
        return NextResponse.json({ error: 'list sub_type requires a valid config.list_uri (at:// URI)' }, { status: 400 });
      }
    }
    const excludeListUri = (config as Record<string, unknown>).exclude_list_uri;
    if (excludeListUri !== undefined && (typeof excludeListUri !== 'string' || !isValidAtUri(excludeListUri))) {
      return NextResponse.json({ error: 'config.exclude_list_uri must be a valid at:// URI' }, { status: 400 });
    }
    if (JSON.stringify(config).length > 1000) {
      return NextResponse.json({ error: 'Config too large' }, { status: 400 });
    }

    // Strip unknown fields — only persist the explicitly validated keys
    const sanitizedConfig: Record<string, string> = {};
    const listUri = (config as Record<string, unknown>).list_uri;
    const excludeListUri2 = (config as Record<string, unknown>).exclude_list_uri;
    if (typeof listUri === 'string') sanitizedConfig.list_uri = listUri;
    if (typeof excludeListUri2 === 'string') sanitizedConfig.exclude_list_uri = excludeListUri2;

    const rows = await query<SubscriptionRow>(
      `INSERT INTO subscriptions (user_id, target_handle, mode, include_followers, sub_type, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, target_handle, mode, sub_type, include_followers, config, last_updated, created_at`,
      [userId, target_handle, mode, include_followers !== false, sub_type, JSON.stringify(sanitizedConfig)]
    );

    return NextResponse.json({ subscription: rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}
