import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials, getSessionUserId, isValidDid } from '@/lib/session';
import { muteAccounts } from '@/lib/bluesky';
import { logBlockEvents } from '@/lib/block-events';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

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

    const validSources = ['manual', 'reblock', 'interaction'] as const;
    type Source = typeof validSources[number];
    const resolvedSource: Source = validSources.includes(source as Source) ? (source as Source) : 'manual';

    const sessionCreds = await getSessionCredentials();
    const isStateless = body.stateless === true;
    const handle: string | undefined = sessionCreds?.handle ?? (isStateless ? body.handle : undefined);
    const password: string | undefined = sessionCreds?.password ?? (isStateless ? body.password : undefined);
    const userId = await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:mute',
      identity: userId ?? handle,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    if (!handle || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    const { succeeded, failed, succeededDids } = await muteAccounts(agent, dids);

    let warning: string | undefined;
    try {
      await logBlockEvents(userId, succeededDids, 'mute', resolvedSource);
    } catch {
      warning = 'Action completed, but local event logging failed.';
    }

    return NextResponse.json({ succeeded, failed, warning });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to mute accounts' }, { status: 500 });
  }
}
