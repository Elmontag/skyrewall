import { NextRequest } from 'next/server';
import { BskyAgent } from '@atproto/api';
import { getSessionCredentials, getSessionUserId, isValidDid } from '@/lib/session';
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

        const sessionDid = agent.session?.did;
        if (!sessionDid) {
          controller.enqueue(encode({ error: 'No active session' }));
          controller.close();
          return;
        }

        let succeeded = 0;
        let failed = 0;
        const succeededDids: string[] = [];
        const total = didList.length;
        const batchSize = 10;

        for (let i = 0; i < total; i += batchSize) {
          const batch = didList.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map((did) =>
              agent.app.bsky.graph.block.create(
                { repo: sessionDid },
                { subject: did, createdAt: new Date().toISOString() }
              )
            )
          );
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled') { succeeded++; succeededDids.push(batch[idx]); }
            else failed++;
          });
          controller.enqueue(encode({ done: Math.min(i + batchSize, total), total, succeeded, failed }));
          if (i + batchSize < total) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }

        // Log events (fire-and-forget)
        const userId = await getSessionUserId();
        if (userId && succeededDids.length > 0) {
          const values = succeededDids.map((_, i) => `($1, $${i + 2}, 'block', '${resolvedSource}')`).join(', ');
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
