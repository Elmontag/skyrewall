import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { getSessionAgent } from '@/lib/session-agent';
import { fetchUserLists, fetchSubscribedModLists, createAgent } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin, sanitizeError } from '@/lib/request-security';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:lists');

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const body = await req.json();

    const sessionAgent = await getSessionAgent();
    const isStateless = body.stateless === true;
    const userId = sessionAgent?.userId ?? await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:lists',
      identity: userId ?? body.handle,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    let agent;
    if (sessionAgent) {
      agent = sessionAgent.agent;
    } else if (isStateless && body.handle && body.password) {
      agent = await createAgent(body.handle, body.password);
    } else {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    log.info('fetch-start', { mode: sessionAgent ? 'stateful' : 'stateless', include_subscribed: body.include_subscribed === true });
    const lists = await fetchUserLists(agent);

    let subscribedModLists: Awaited<ReturnType<typeof fetchSubscribedModLists>> | undefined;
    if (body.include_subscribed === true) {
      subscribedModLists = await fetchSubscribedModLists(agent);
    }

    log.info('fetch-complete', { ownLists: lists.length, subscribedLists: subscribedModLists?.length ?? 0 });
    return NextResponse.json({ lists, ...(subscribedModLists !== undefined ? { subscribedModLists } : {}) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('fetch-failed', { error: sanitizeError(err) });
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
  }
}
