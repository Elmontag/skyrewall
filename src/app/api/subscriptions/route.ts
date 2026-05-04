import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifySession } from '@/lib/encryption';
import { cookies } from 'next/headers';

interface SubscriptionRow {
  id: string;
  target_handle: string;
  mode: string;
  include_followers: boolean;
  last_updated: string | null;
  created_at: string;
}

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session) return null;
  try {
    const payload = verifySession(session.value);
    if (!payload) return null;
    const { userId } = JSON.parse(payload);
    return userId;
  } catch {
    return null;
  }
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subscriptions = await query<SubscriptionRow>(
    'SELECT id, target_handle, mode, include_followers, last_updated, created_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  return NextResponse.json({ subscriptions });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { target_handle, mode, include_followers } = await req.json();
    if (!target_handle || !mode) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    if (!['block', 'mute'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const rows = await query<SubscriptionRow>(
      `INSERT INTO subscriptions (user_id, target_handle, mode, include_followers)
       VALUES ($1, $2, $3, $4)
       RETURNING id, target_handle, mode, include_followers, last_updated, created_at`,
      [userId, target_handle, mode, include_followers !== false]
    );

    return NextResponse.json({ subscription: rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}
