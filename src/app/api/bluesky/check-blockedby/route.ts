import { NextRequest, NextResponse } from 'next/server';
import { getSessionCredentials, getSessionUserId } from '@/lib/session';
import { fetchBlockedByFromClearSky, enrichProfileBatch, createAgent } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin, sanitizeError } from '@/lib/request-security';

const MAX_RESULTS = 5000;

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const body = await req.json().catch(() => ({}));

    const sessionCreds = await getSessionCredentials();
    const isStateless = body.stateless === true;
    const handle: string | undefined = sessionCreds?.handle ?? (isStateless ? body.handle : undefined);
    const password: string | undefined = sessionCreds?.password ?? (isStateless ? body.password : undefined);
    const userId = await getSessionUserId();

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
          // Fetch who blocks this user from ClearSky (no credentials sent to ClearSky)
          const blockerDids = await fetchBlockedByFromClearSky(handle, MAX_RESULTS, (count) => {
            controller.enqueue(encode({ count }));
          });

          if (blockerDids.length === 0) {
            controller.enqueue(encode({ blockers: [], complete: true }));
            return;
          }

          // Enrich with profile data if credentials are available
          let blockers;
          if (password) {
            const agent = await createAgent(handle, password);
            blockers = await enrichProfileBatch(agent, blockerDids);
          } else {
            blockers = blockerDids.map((did) => ({ did, handle: did }));
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
