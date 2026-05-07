import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { getSessionAgent } from '@/lib/session-agent';
import { fetchListMembers, createAgent } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin, isValidAtUri, sanitizeError } from '@/lib/request-security';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:list-members');

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const body = await req.json();
    const { list_uri } = body;

    const sessionAgent = await getSessionAgent();
    const isStateless = body.stateless === true;
    const userId = sessionAgent?.userId ?? await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:list-members',
      identity: userId ?? body.handle,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    if (!list_uri) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof list_uri !== 'string' || !isValidAtUri(list_uri)) {
      return NextResponse.json({ error: 'Invalid list URI' }, { status: 400 });
    }

    let agent;
    if (sessionAgent) {
      agent = sessionAgent.agent;
    } else if (isStateless && body.handle && body.password) {
      agent = await createAgent(body.handle, body.password);
    } else {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // SSE stream — emits { count } after each page, then { members, complete }
    // NOTE: This endpoint intentionally does NOT write to list_cache.
    // list_cache is only populated by the subscription sync worker (stateful users only).
    const encode = (data: object) =>
      new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          log.info('fetch-start', { mode: sessionAgent ? 'stateful' : 'stateless', list_uri });
          const members = await fetchListMembers(agent, list_uri, 5000, (count) => {
            controller.enqueue(encode({ count }));
          });
          log.info('fetch-complete', { list_uri, count: members.length });
          controller.enqueue(encode({ members, complete: true }));
        } catch (err) {
          const message = err instanceof Error ? sanitizeError(err) : 'Unknown error';
          log.error('fetch-failed', { list_uri, error: message });
          controller.enqueue(encode({ error: message }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('request-failed', { error: sanitizeError(err) });
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch list members' }, { status: 500 });
  }
}
