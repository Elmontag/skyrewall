import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { getSessionAgent } from '@/lib/session-agent';
import { fetchAllFollowers, createAgent } from '@/lib/bluesky';
import { checkApiRateLimit, rejectCrossOrigin } from '@/lib/request-security';

export async function POST(req: NextRequest) {
  try {
    const originRejection = rejectCrossOrigin(req);
    if (originRejection) return originRejection;

    const body = await req.json();
    const { targetHandle, resolveOnly } = body;

    const sessionAgent = await getSessionAgent();
    const isStateless = body.stateless === true;
    const userId = sessionAgent?.userId ?? await getSessionUserId();

    const limited = checkApiRateLimit(req, {
      scope: 'bluesky:followers',
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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!targetHandle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const profile = await agent.getProfile({ actor: targetHandle });
    const targetDid = profile.data.did;

    if (resolveOnly) {
      return NextResponse.json({ targetDid });
    }

    const encode = (data: object) =>
      new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const followers = await fetchAllFollowers(agent, targetHandle, (count) => {
            controller.enqueue(encode({ count }));
          });
          controller.enqueue(encode({ followers, targetDid, complete: true }));
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
    return NextResponse.json({ error: 'Failed to fetch followers' }, { status: 500 });
  }
}
