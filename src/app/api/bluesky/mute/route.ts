import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials, isValidDid } from '@/lib/session';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dids } = body;

    if (!Array.isArray(dids)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (dids.length > MAX_DIDS) {
      return NextResponse.json({ error: `Too many DIDs (max ${MAX_DIDS})` }, { status: 400 });
    }
    if (!dids.every(isValidDid)) {
      return NextResponse.json({ error: 'One or more DIDs are invalid' }, { status: 400 });
    }

    const sessionCreds = await getSessionCredentials();
    const handle: string | undefined = sessionCreds?.handle ?? body.handle;
    const password: string | undefined = sessionCreds?.password ?? body.password;

    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    let succeeded = 0;
    let failed = 0;
    const batchSize = 10;

    for (let i = 0; i < dids.length; i += batchSize) {
      const batch = dids.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((did: string) => agent.mute(did))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') succeeded++;
        else failed++;
      }
      if (i + batchSize < dids.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return NextResponse.json({ succeeded, failed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to mute accounts' }, { status: 500 });
  }
}

