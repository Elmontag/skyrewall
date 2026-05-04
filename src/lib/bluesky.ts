import { BskyAgent } from '@atproto/api';
import type { Follower } from '@/types';

export async function createAgent(handle: string, password: string): Promise<BskyAgent> {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: handle, password });
  return agent;
}

export async function fetchAllFollowers(
  agent: BskyAgent,
  targetHandle: string,
  onProgress?: (count: number, page: number) => void
): Promise<Follower[]> {
  const followers: Follower[] = [];
  let cursor: string | undefined;
  let page = 0;

  do {
    page++;
    const response = await agent.getFollowers({
      actor: targetHandle,
      limit: 100,
      cursor,
    });

    const batch = response.data.followers.map((f) => ({
      did: f.did,
      handle: f.handle,
      displayName: f.displayName,
      avatar: f.avatar,
      description: f.description,
    }));

    followers.push(...batch);
    cursor = response.data.cursor;

    if (onProgress) {
      onProgress(followers.length, page);
    }

    // Small delay to avoid rate limiting
    if (cursor) {
      await new Promise((r) => setTimeout(r, 200));
    }
  } while (cursor);

  return followers;
}

export async function blockAccounts(
  agent: BskyAgent,
  dids: string[],
  batchSize = 10
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (did) => {
        try {
          if (!agent.session) throw new Error('No active session');
          await agent.app.bsky.graph.block.create(
            { repo: agent.session.did },
            { subject: did, createdAt: new Date().toISOString() }
          );
          succeeded++;
        } catch {
          failed++;
        }
      })
    );
    // Rate limit pause between batches
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { succeeded, failed };
}

export async function muteAccounts(
  agent: BskyAgent,
  dids: string[],
  batchSize = 10
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (did) => {
        try {
          await agent.mute(did);
          succeeded++;
        } catch {
          failed++;
        }
      })
    );
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { succeeded, failed };
}
