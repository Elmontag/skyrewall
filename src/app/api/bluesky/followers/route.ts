import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials } from '@/lib/session';

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

    // Fetch all followers with pagination
    const followers: { did: string; handle: string; displayName?: string; avatar?: string; description?: string }[] = [];
    let cursor: string | undefined;

    do {
      const response = await agent.getFollowers({
        actor: targetHandle,
        limit: 100,
        cursor,
      });

      for (const f of response.data.followers) {
        followers.push({
          did: f.did,
          handle: f.handle,
          displayName: f.displayName,
          avatar: f.avatar,
          description: f.description,
        });
      }

      cursor = response.data.cursor;

      if (cursor) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } while (cursor);

    return NextResponse.json({ followers, targetDid });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch followers' }, { status: 500 });
  }
}

