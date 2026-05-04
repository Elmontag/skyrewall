import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';

interface SubscriptionRow {
  id: string;
  target_handle: string;
  mode: string;
  sub_type: string;
  include_followers: boolean;
  last_updated: string | null;
  created_at: string;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscriptions = await query<SubscriptionRow>(
    'SELECT id, target_handle, mode, sub_type, include_followers, last_updated, created_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return NextResponse.json({ subscriptions });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { target_handle, mode, include_followers, sub_type = 'follower' } = await req.json();
    if (!target_handle || !mode) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!['block', 'mute'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }
    if (!['follower', 'reblock'].includes(sub_type)) {
      return NextResponse.json({ error: 'Invalid sub_type' }, { status: 400 });
    }

    const rows = await query<SubscriptionRow>(
      `INSERT INTO subscriptions (user_id, target_handle, mode, include_followers, sub_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, target_handle, mode, sub_type, include_followers, last_updated, created_at`,
      [userId, target_handle, mode, include_followers !== false, sub_type]
    );

    return NextResponse.json({ subscription: rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}
