import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials } from '@/lib/session';
import { fetchPostInteractors } from '@/lib/bluesky';

const MAX_RESULTS = 5000;

/** Convert a bsky.app post URL to an AT-URI */
async function resolvePostUri(agent: BskyAgent, input: string): Promise<string> {
  // Already an AT-URI
  if (input.startsWith('at://')) return input;

  // https://bsky.app/profile/<handleOrDid>/post/<rkey>
  const match = input.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error('Invalid post URL or AT-URI');

  const [, actorOrHandle, rkey] = match;
  // Resolve handle to DID if necessary
  let did = actorOrHandle;
  if (!did.startsWith('did:')) {
    const res = await agent.resolveHandle({ handle: actorOrHandle });
    did = res.data.did;
  }

  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postUrl, types } = body;

    if (!postUrl || typeof postUrl !== 'string') {
      return NextResponse.json({ error: 'postUrl is required' }, { status: 400 });
    }

    const validTypes = ['likes', 'reposts', 'quotes'];
    const resolvedTypes: ('likes' | 'reposts' | 'quotes')[] = Array.isArray(types)
      ? types.filter((t): t is 'likes' | 'reposts' | 'quotes' => validTypes.includes(t))
      : ['likes', 'reposts', 'quotes'];

    if (resolvedTypes.length === 0) {
      return NextResponse.json({ error: 'At least one interaction type is required' }, { status: 400 });
    }

    const sessionCreds = await getSessionCredentials();
    const handle: string | undefined = sessionCreds?.handle ?? body.handle;
    const password: string | undefined = sessionCreds?.password ?? body.password;

    if (!handle || !password) {
      return NextResponse.json({ error: 'Credentials required' }, { status: 401 });
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier: handle, password });

    const atUri = await resolvePostUri(agent, postUrl.trim());

    const encode = (data: object) =>
      new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const interactors = await fetchPostInteractors(agent, atUri, resolvedTypes, MAX_RESULTS, (count) => {
            controller.enqueue(encode({ count }));
          });
          controller.enqueue(encode({ interactors, complete: true }));
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
    if (message.includes('Invalid post URL')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('[post-interactions]', err);
    return NextResponse.json({ error: 'Failed to fetch post interactions' }, { status: 500 });
  }
}
