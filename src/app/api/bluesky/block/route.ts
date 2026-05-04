import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials, getSessionUserId, isValidDid } from '@/lib/session';
import { blockAccounts } from '@/lib/bluesky';
import { query } from '@/lib/db';

const MAX_DIDS = 5000;

async function logBlockEvents(userId: string | null, dids: string[], source: string) {
  if (!userId || dids.length === 0) return;
  try {
    const values = dids.map((_, i) => `($1, $${i + 2}, 'block', '${source}')`).join(', ');
    await query(
      `INSERT INTO block_events (user_id, target_did, action, source) VALUES ${values} ON CONFLICT DO NOTHING`,
      [userId, ...dids]
    );
  } catch {
    // Non-fatal — logging failure should not fail the request
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dids, source = 'manual' } = body;

    if (!Array.isArray(dids)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (dids.length > MAX_DIDS) {
      return NextResponse.json({ error: `Too many DIDs (max ${MAX_DIDS})` }, { status: 400 });
    }
    if (!dids.every(isValidDid)) {
      return NextResponse.json({ error: 'One or more DIDs are invalid' }, { status: 400 });
    }

    const validSources = ['manual', 'reblock', 'interaction'];
    const resolvedSource = validSources.includes(source) ? source : 'manual';

    const sessionCreds = await getSessionCredentials();
    const handle: string | undefined = sessionCreds?.handle ?? body.handle;
    const password: string | undefined = sessionCreds?.password ?? body.password;

    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    const { succeeded, failed, succeededDids } = await blockAccounts(agent, dids);

    // Log events asynchronously (fire-and-forget, non-fatal)
    const userId = await getSessionUserId();
    logBlockEvents(userId, succeededDids, resolvedSource).catch(() => {});

    return NextResponse.json({ succeeded, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to block accounts' }, { status: 500 });
  }
}
