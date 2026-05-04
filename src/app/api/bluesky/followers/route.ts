import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials } from '@/lib/session';
import { fetchAllFollowers } from '@/lib/bluesky';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetHandle, resolveOnly } = body;

    // Prefer session credentials; fall back to explicit body credentials for stateless use
    const sessionCreds = await getSessionCredentials();
    const handle: string | undefined = sessionCreds?.handle ?? body.handle;
    const password: string | undefined = sessionCreds?.password ?? body.password;

    if (!handle || !password || !targetHandle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    // Resolve target DID
    const profile = await agent.getProfile({ actor: targetHandle });
    const targetDid = profile.data.did;

    if (resolveOnly) {
      return NextResponse.json({ targetDid });
    }

    // SSE stream — emits { count } after each page, then { followers, targetDid, complete }
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

