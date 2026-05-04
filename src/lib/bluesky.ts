import { BskyAgent } from '@atproto/api';
import type { Follower } from '@/types';
import { query } from '@/lib/db';

const CLEARSKY_BASE = 'https://public.api.clearsky.services';

/**
 * Retries an async operation on HTTP 429/503 with exponential backoff.
 * Respects Retry-After header (capped at 60s). Up to maxAttempts total tries.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      if (status !== 429 && status !== 503) throw err;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retryAfterRaw = (err as any)?.headers?.get?.('retry-after');
      let waitMs: number;
      if (retryAfterRaw) {
        const secs = parseInt(retryAfterRaw as string, 10);
        waitMs = Math.min(isNaN(secs) ? 1000 : secs * 1000, 60_000);
      } else {
        waitMs = Math.min(1000 * Math.pow(2, attempt), 60_000);
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

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
  batchSize = 10,
  onProgress?: (done: number, total: number, succeeded: number, failed: number) => void
): Promise<{ succeeded: number; failed: number; succeededDids: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const succeededDids: string[] = [];

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (did) => {
        try {
          if (!agent.session) throw new Error('No active session');
          await withRetry(() =>
            agent.app.bsky.graph.block.create(
              { repo: agent.session!.did },
              { subject: did, createdAt: new Date().toISOString() }
            )
          );
          succeeded++;
          succeededDids.push(did);
        } catch {
          failed++;
        }
      })
    );
    if (onProgress) onProgress(Math.min(i + batchSize, dids.length), dids.length, succeeded, failed);
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { succeeded, failed, succeededDids };
}

export async function muteAccounts(
  agent: BskyAgent,
  dids: string[],
  batchSize = 10,
  onProgress?: (done: number, total: number, succeeded: number, failed: number) => void
): Promise<{ succeeded: number; failed: number; succeededDids: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const succeededDids: string[] = [];

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (did) => {
        try {
          await withRetry(() => agent.mute(did));
          succeeded++;
          succeededDids.push(did);
        } catch {
          failed++;
        }
      })
    );
    if (onProgress) onProgress(Math.min(i + batchSize, dids.length), dids.length, succeeded, failed);
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { succeeded, failed, succeededDids };
}

/**
 * One-time import of a user's existing BlueSky blocks and mutes into block_events.
 * Called on first subscription sync to warm the DB-diff cache (cold-start fix).
 * Cost: O(existing_blocks / 100) + O(existing_mutes / 100) API requests — runs once.
 */
export async function importExistingActions(
  agent: BskyAgent,
  userId: string
): Promise<{ blocksImported: number; mutesImported: number }> {
  let blocksImported = 0;
  let mutesImported = 0;

  // Import existing blocks
  try {
    let cursor: string | undefined;
    do {
      const res = await agent.app.bsky.graph.getBlocks({ limit: 100, cursor });
      const dids = res.data.blocks.map((b) => b.did);
      if (dids.length > 0) {
        const values = dids.map((_, i) => `('${userId}', $${i + 1}, 'block', 'imported')`).join(', ');
        await query(
          `INSERT INTO block_events (user_id, target_did, action, source) VALUES ${values} ON CONFLICT DO NOTHING`,
          dids
        );
        blocksImported += dids.length;
      }
      cursor = res.data.cursor;
      if (cursor) await new Promise((r) => setTimeout(r, 300));
    } while (cursor);
  } catch {
    // Non-fatal — best effort
  }

  // Import existing mutes
  try {
    let cursor: string | undefined;
    do {
      const res = await agent.app.bsky.graph.getMutes({ limit: 100, cursor });
      const dids = res.data.mutes.map((m) => m.did);
      if (dids.length > 0) {
        const values = dids.map((_, i) => `('${userId}', $${i + 1}, 'mute', 'imported')`).join(', ');
        await query(
          `INSERT INTO block_events (user_id, target_did, action, source) VALUES ${values} ON CONFLICT DO NOTHING`,
          dids
        );
        mutesImported += dids.length;
      }
      cursor = res.data.cursor;
      if (cursor) await new Promise((r) => setTimeout(r, 300));
    } while (cursor);
  } catch {
    // Non-fatal — best effort
  }

  // Mark import as done
  await query(`UPDATE users SET blocks_imported_at = NOW() WHERE id = $1`, [userId]).catch(() => {});

  return { blocksImported, mutesImported };
}

/**
 * Fetches DIDs of all accounts that have blocked `handle` using the ClearSky API.
 * ClearSky indexes public AT Protocol block relationships — no user credentials sent.
 * Server-side only. Returns raw DID strings, capped at maxResults.
 */
export async function fetchBlockedByFromClearSky(
  handle: string,
  maxResults = 5000,
  onProgress?: (count: number) => void
): Promise<string[]> {
  const dids: string[] = [];
  let page = 1;

  while (dids.length < maxResults) {
    const url = `${CLEARSKY_BASE}/api/v1/anon/single-blocklist/${encodeURIComponent(handle)}/${page}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SkyRewall/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) break;

    const json = await res.json() as {
      data?: { blocklist?: { did: string }[] };
    };
    const batch = json.data?.blocklist ?? [];
    if (batch.length === 0) break;

    for (const item of batch) {
      if (dids.length >= maxResults) break;
      if (typeof item.did === 'string') dids.push(item.did);
    }

    if (onProgress) onProgress(dids.length);

    if (batch.length < 100) break; // last page
    page++;

    // Respect ClearSky rate limit (5 req/s)
    await new Promise((r) => setTimeout(r, 250));
  }

  return dids;
}

/**
 * Enriches an array of DIDs with profile data (handle, displayName, avatar)
 * using BlueSky's getProfiles endpoint (max 25 per call).
 */
export async function enrichProfileBatch(
  agent: BskyAgent,
  dids: string[]
): Promise<Follower[]> {
  const results: Follower[] = [];
  const batchSize = 25;

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    try {
      const res = await agent.getProfiles({ actors: batch });
      for (const p of res.data.profiles) {
        results.push({
          did: p.did,
          handle: p.handle,
          displayName: p.displayName,
          avatar: p.avatar,
          description: p.description,
        });
      }
    } catch {
      // If profile fetch fails, include DIDs with minimal info
      for (const did of batch) {
        results.push({ did, handle: did });
      }
    }
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

/**
 * Checks which DIDs are mutual follows of the authenticated user
 * (viewer.following && viewer.followedBy). Returns the subset of mutual DIDs.
 */
export async function checkMutuals(
  agent: BskyAgent,
  dids: string[]
): Promise<string[]> {
  const mutuals: string[] = [];
  const batchSize = 25;

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    try {
      const res = await agent.getProfiles({ actors: batch });
      for (const p of res.data.profiles) {
        if (p.viewer?.following && p.viewer?.followedBy) {
          mutuals.push(p.did);
        }
      }
    } catch {
      // skip on error
    }
    if (i + batchSize < dids.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return mutuals;
}

/**
 * Fetches all accounts that interacted with a post (liked, reposted, or quoted).
 * Returns a deduplicated list of Followers, capped at maxResults.
 */
export async function fetchPostInteractors(
  agent: BskyAgent,
  atUri: string,
  types: ('likes' | 'reposts' | 'quotes')[],
  maxResults = 5000,
  onProgress?: (count: number) => void
): Promise<Follower[]> {
  const seen = new Map<string, Follower>();

  const addActor = (a: { did: string; handle: string; displayName?: string; avatar?: string; description?: string }) => {
    if (!seen.has(a.did)) {
      seen.set(a.did, {
        did: a.did,
        handle: a.handle,
        displayName: a.displayName,
        avatar: a.avatar,
        description: a.description,
      });
      if (onProgress) onProgress(seen.size);
    }
  };

  const fetchers: Promise<void>[] = [];

  if (types.includes('likes')) {
    fetchers.push((async () => {
      let cursor: string | undefined;
      do {
        if (seen.size >= maxResults) break;
        const res = await agent.getLikes({ uri: atUri, limit: 100, cursor });
        for (const l of res.data.likes) addActor(l.actor);
        cursor = res.data.cursor;
        if (cursor) await new Promise((r) => setTimeout(r, 200));
      } while (cursor && seen.size < maxResults);
    })());
  }

  if (types.includes('reposts')) {
    fetchers.push((async () => {
      let cursor: string | undefined;
      do {
        if (seen.size >= maxResults) break;
        const res = await agent.getRepostedBy({ uri: atUri, limit: 100, cursor });
        for (const a of res.data.repostedBy) addActor(a);
        cursor = res.data.cursor;
        if (cursor) await new Promise((r) => setTimeout(r, 200));
      } while (cursor && seen.size < maxResults);
    })());
  }

  if (types.includes('quotes')) {
    fetchers.push((async () => {
      let cursor: string | undefined;
      do {
        if (seen.size >= maxResults) break;
        const res = await agent.api.app.bsky.feed.getQuotes({ uri: atUri, limit: 100, cursor });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resAny = res.data as any;
        const feed: Array<{ post?: { author?: { did: string; handle: string; displayName?: string; avatar?: string } } }> = resAny.feed ?? [];
        for (const post of feed) {
          if (post.post?.author) addActor(post.post.author);
        }
        cursor = resAny.cursor as string | undefined;
        if (cursor) await new Promise((r) => setTimeout(r, 200));
      } while (cursor && seen.size < maxResults);
    })());
  }

  await Promise.allSettled(fetchers);

  return Array.from(seen.values()).slice(0, maxResults);
}

