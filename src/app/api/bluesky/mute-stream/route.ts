import { NextRequest } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials, getSessionUserId, isValidDid } from '@/lib/session';
import { muteAccounts } from '@/lib/bluesky';
import { query } from '@/lib/db';

const MAX_DIDS = 5000;

export async function POST(req: NextRequest) {
  let body: { dids?: unknown; source?: string; handle?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const { dids, source = 'manual' } = body;

  if (!Array.isArray(dids) || dids.length === 0 || dids.length > MAX_DIDS || !dids.every(isValidDid)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing dids' }), { status: 400 });
  }

  const sessionCreds = await getSessionCredentials();
  const handle = sessionCreds?.handle ?? body.handle;
  const password = sessionCreds?.password ?? body.password;

  if (!handle || !password) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const validSources = ['manual', 'reblock', 'interaction'];
  const resolvedSource = validSources.includes(source as string) ? (source as string) : 'manual';
  const didList = dids as string[];

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (data: object) =>
        new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);

      try {
        const agent = new BskyAgent({ service: 'https://bsky.social' });
        await agent.login({ identifier: handle as string, password: password as string });

        const total = didList.length;
        const { succeeded, failed, succeededDids } = await muteAccounts(
          agent,
          didList,
          10,
          (done, tot, succ, fail) => {
            controller.enqueue(encode({ done, total: tot, succeeded: succ, failed: fail }));
          }
        );

        // Log events (fire-and-forget)
        const userId = await getSessionUserId();
        if (userId && succeededDids.length > 0) {
          const values = succeededDids.map((_, i) => `($1, $${i + 2}, 'mute', '${resolvedSource}')`).join(', ');
          query(
            `INSERT INTO block_events (user_id, target_did, action, source) VALUES ${values} ON CONFLICT DO NOTHING`,
            [userId, ...succeededDids]
          ).catch(() => {});
        }

        controller.enqueue(encode({ done: total, total, succeeded, failed, complete: true }));
      } catch (err) {
        controller.enqueue(encode({ error: err instanceof Error ? err.message : 'Unknown error' }));
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
}
