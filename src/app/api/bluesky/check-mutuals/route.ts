import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials, isValidDid } from '@/lib/session';
import { checkMutuals } from '@/lib/bluesky';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  try {
    const sessionCreds = await getSessionCredentials();
    if (!sessionCreds) {
      return NextResponse.json({ error: 'Login required for mutual protection' }, { status: 401 });
    }

    const body = await req.json();
    const { dids } = body;

    if (!Array.isArray(dids)) {
      return NextResponse.json({ error: 'dids must be an array' }, { status: 400 });
    }
    if (dids.length > MAX_DIDS) {
      return NextResponse.json({ error: `Too many DIDs (max ${MAX_DIDS})` }, { status: 400 });
    }
    if (!dids.every(isValidDid)) {
      return NextResponse.json({ error: 'One or more DIDs are invalid' }, { status: 400 });
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: sessionCreds.handle, password: sessionCreds.password });

    const mutualDids = await checkMutuals(agent, dids);

    return NextResponse.json({ mutualDids });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    console.error('[check-mutuals]', err);
    return NextResponse.json({ error: 'Failed to check mutuals' }, { status: 500 });
  }
}
