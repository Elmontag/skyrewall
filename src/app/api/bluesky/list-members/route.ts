import { NextRequest, NextResponse } from 'next/server';
import { getSessionCredentials, getSessionUserId } from '@/lib/session';
import { fetchListMembers, createAgent } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin, isValidAtUri } from '@/lib/request-security';
import { sanitizeError } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const body = await req.json();
    const { list_uri } = body;

    // Prefer session credentials; fall back to explicit body credentials for stateless use
    const sessionCreds = await getSessionCredentials();
    const isStateless = body.stateless === true;
    const handle: string | undefined = sessionCreds?.handle ?? (isStateless ? body.handle : undefined);
    const password: string | undefined = sessionCreds?.password ?? (isStateless ? body.password : undefined);
    const userId = await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:list-members',
      identity: userId ?? handle,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    if (!handle || !password || !list_uri) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof list_uri !== 'string' || !isValidAtUri(list_uri)) {
      return NextResponse.json({ error: 'Invalid list URI' }, { status: 400 });
    }

    const agent = await createAgent(handle, password);

    // SSE stream — emits { count } after each page, then { members, complete }
    // NOTE: This endpoint intentionally does NOT write to list_cache.
    // list_cache is only populated by the subscription sync worker (stateful users only).
    const encode = (data: object) =>
      new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const members = await fetchListMembers(agent, list_uri, 5000, (count) => {
            controller.enqueue(encode({ count }));
          });
          controller.enqueue(encode({ members, complete: true }));
        } catch (err) {
          const message = err instanceof Error ? sanitizeError(err) : 'Unknown error';
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
    console.error('[api/bluesky/list-members]', sanitizeError(err));
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch list members' }, { status: 500 });
  }
}
