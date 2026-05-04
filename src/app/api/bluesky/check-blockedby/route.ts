import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials } from '@/lib/session';
import { fetchBlockedByFromClearSky, enrichProfileBatch } from '@/lib/bluesky';

const MAX_RESULTS = 5000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const sessionCreds = await getSessionCredentials();
    const handle: string | undefined = sessionCreds?.handle ?? body.handle;
    const password: string | undefined = sessionCreds?.password ?? body.password;

    if (!handle) {
      return NextResponse.json({ error: 'Handle is required' }, { status: 400 });
    }

    // Fetch who blocks this user from ClearSky (server-side, no credentials sent to ClearSky)
    const blockerDids = await fetchBlockedByFromClearSky(handle, MAX_RESULTS);

    if (blockerDids.length === 0) {
      return NextResponse.json({ blockers: [] });
    }

    // Enrich with profile data if credentials are available
    let blockers;
    if (handle && password) {
      const agent = new BskyAgent({ service: 'https://bsky.social' });
      await agent.login({ identifier: handle, password });
      blockers = await enrichProfileBatch(agent, blockerDids);
    } else {
      blockers = blockerDids.map((did) => ({ did, handle: did }));
    }

    return NextResponse.json({ blockers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    console.error('[check-blockedby]', err);
    return NextResponse.json({ error: 'Failed to fetch blocker list' }, { status: 500 });
  }
}
