import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, isValidDid } from '@/lib/session';
import { getSessionAgent } from '@/lib/session-agent';
import { blockAccounts, createAgent } from '@/lib/bluesky';
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

    const sessionAgent = await getSessionAgent();
    const isStateless = body.stateless === true;
    const userId = sessionAgent?.userId ?? await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:block',
      identity: userId ?? body.handle,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    let agent;
    if (sessionAgent) {
      agent = sessionAgent.agent;
    } else if (isStateless && body.handle && body.password) {
      agent = await createAgent(body.handle, body.password);
    } else {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { succeeded, failed, succeededDids } = await blockAccounts(agent, dids);

    let warning: string | undefined;
    try {
      await logBlockEvents(userId, succeededDids, 'block', resolvedSource);
    } catch {
      warning = 'Action completed, but local event logging failed.';
    }

    return NextResponse.json({ succeeded, failed, warning });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to block accounts' }, { status: 500 });
  }
}
