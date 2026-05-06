import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { getSessionAgent } from '@/lib/session-agent';
import { fetchBlockedByFromClearSky, enrichProfileBatch, createAgent } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin, sanitizeError } from '@/lib/request-security';

const MAX_RESULTS = 5000;

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const body = await req.json().catch(() => ({}));

    const sessionAgent = await getSessionAgent();
    const isStateless = body.stateless === true;
    const handle: string | undefined = sessionAgent?.handle ?? (isStateless ? body.handle : undefined);
    const userId = sessionAgent?.userId ?? await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:check-blockedby',
      identity: userId ?? handle,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    if (!handle) {
      return NextResponse.json({ error: 'Handle is required' }, { status: 400 });
    }

    const encode = (data: object) =>
      new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const blockerDids = await fetchBlockedByFromClearSky(handle, MAX_RESULTS, (count) => {
            controller.enqueue(encode({ count }));
          });

          if (blockerDids.length === 0) {
            controller.enqueue(encode({ blockers: [], complete: true }));
            return;
          }

          let blockers;
          if (sessionAgent) {
            blockers = await enrichProfileBatch(sessionAgent.agent, blockerDids);
          } else if (isStateless && body.handle && body.password) {
            const agent = await createAgent(body.handle, body.password);
            blockers = await enrichProfileBatch(agent, blockerDids);
          } else {
            blockers = blockerDids.map((did: string) => ({ did, handle: did }));
          }

          controller.enqueue(encode({ blockers, complete: true }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
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
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    console.error('[check-blockedby]', sanitizeError(err));
    return NextResponse.json({ error: 'Failed to fetch blocker list' }, { status: 500 });
  }
}
