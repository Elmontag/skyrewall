import { query } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { createAgent, fetchAllFollowers, blockAccounts, muteAccounts, fetchBlockedByFromClearSky, fetchPostInteractors, importExistingActions } from '@/lib/bluesky';
import { logBlockEvents } from '@/lib/block-events';
import { sanitizeError } from '@/lib/request-security';

interface SyncRow {
  sub_id: string;
  user_id: string;
  target_handle: string;
  mode: string;
  sub_type: string;
  include_followers: boolean;
  config: Record<string, unknown>;
  handle: string;
  encrypted_password: string;
}

/** Returns DIDs already actioned by this user (DB-only, 0 API calls). */
async function getAlreadyActionedDids(
  userId: string,
  dids: string[],
  action: 'block' | 'mute'
): Promise<Set<string>> {
  if (dids.length === 0) return new Set();
  try {
    const rows = await query<{ target_did: string }>(
      `SELECT target_did FROM block_events WHERE user_id = $1 AND action = $2 AND target_did = ANY($3)`,
      [userId, action, dids]
    );
    return new Set(rows.map((r) => r.target_did));
  } catch {
    return new Set();
  }
}

/** Returns DIDs on the user's whitelist — these are never actioned by subscriptions. */
async function getWhitelistedDids(userId: string, dids: string[]): Promise<Set<string>> {
  if (dids.length === 0) return new Set();
  try {
    const rows = await query<{ target_did: string }>(
      `SELECT target_did FROM whitelists WHERE user_id = $1 AND target_did = ANY($2)`,
      [userId, dids]
    );
    return new Set(rows.map((r) => r.target_did));
  } catch {
    return new Set();
  }
}

/** Returns true if this user's existing BlueSky blocks have already been imported. */
async function hasImportedExistingBlocks(userId: string): Promise<boolean> {
  try {
    const rows = await query<{ blocks_imported_at: string | null }>(
      `SELECT blocks_imported_at FROM users WHERE id = $1`,
      [userId]
    );
    return rows.length > 0 && rows[0].blocks_imported_at !== null;
  } catch {
    return true; // On error, skip import to avoid accidental spam
  }
}

async function syncAllSubscriptions(): Promise<void> {
  const rows = await query<SyncRow>(`
    SELECT s.id AS sub_id, s.user_id, s.target_handle, s.mode, s.sub_type, s.include_followers, s.config,
           u.handle, u.encrypted_password
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
  `);

  if (rows.length === 0) return;

  console.log(`[sync] Processing ${rows.length} subscription(s)...`);

  // Track which users have already had their cold-start import done this run
  const importedUsers = new Set<string>();

  for (const row of rows) {
    try {
      const password = decrypt(row.encrypted_password);
      const agent = await createAgent(row.handle, password);

      // Cold-start: import existing BlueSky blocks/mutes once per user
      if (!importedUsers.has(row.user_id)) {
        const alreadyImported = await hasImportedExistingBlocks(row.user_id);
        if (!alreadyImported) {
          console.log(`[sync] Cold-start import for ${row.handle}...`);
          const { blocksImported, mutesImported } = await importExistingActions(agent, row.user_id);
          console.log(`[sync] Imported ${blocksImported} blocks + ${mutesImported} mutes for ${row.handle}`);
        }
        importedUsers.add(row.user_id);
      }

      let dids: string[];

      if (row.sub_type === 'reblock') {
        dids = await fetchBlockedByFromClearSky(row.handle);
      } else if (row.sub_type === 'postinteraction') {
        const config = (row.config ?? {}) as { types?: string[] };
        const types = (config.types ?? ['likes', 'reposts', 'quotes']) as ('likes' | 'reposts' | 'quotes')[];
        const interactors = await fetchPostInteractors(agent, row.target_handle, types);
        dids = interactors.map((f) => f.did);
      } else if (row.include_followers) {
        const followers = await fetchAllFollowers(agent, row.target_handle);
        dids = followers.map((f) => f.did);
      } else {
        const profile = await agent.getProfile({ actor: row.target_handle });
        dids = [profile.data.did];
      }

      if (dids.length > 0) {
        const action = row.mode as 'block' | 'mute';
        const source: 'subscription' | 'reblock' | 'interaction' =
          row.sub_type === 'reblock' ? 'reblock' :
          row.sub_type === 'postinteraction' ? 'interaction' : 'subscription';

        // Filter out whitelisted DIDs (never actioned by subscriptions)
        const whitelisted = await getWhitelistedDids(row.user_id, dids);
        const nonWhitelisted = dids.filter((d) => !whitelisted.has(d));

        // Filter out DIDs already actioned in a previous sync (0 extra API calls)
        const alreadyActioned = await getAlreadyActionedDids(row.user_id, nonWhitelisted, action);
        const newDids = nonWhitelisted.filter((d) => !alreadyActioned.has(d));

        if (newDids.length > 0) {
          if (action === 'block') {
            await blockAccounts(agent, newDids);
          } else {
            await muteAccounts(agent, newDids);
          }
          await logBlockEvents(row.user_id, newDids, action, source);
        }

        const skipped = alreadyActioned.size;
        const wlSkipped = whitelisted.size;
        console.log(`[sync] ✓ ${row.handle} → @${row.target_handle} (${row.mode}/${row.sub_type}, ${newDids.length} new, ${skipped} skipped, ${wlSkipped} whitelisted)`);
      } else {
        console.log(`[sync] ✓ ${row.handle} → @${row.target_handle} (${row.mode}/${row.sub_type}, 0 accounts)`);
      }

      await query('UPDATE subscriptions SET last_updated = NOW() WHERE id = $1', [row.sub_id]);
    } catch (err) {
      console.error(`[sync] ✗ subscription ${row.sub_id} failed:`, sanitizeError(err));
    }

    // Small inter-subscription pause to avoid burst rate-limit when a user has many subscriptions
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function startSyncWorker(): void {
  const intervalMinutes = Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '60', 10));
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[sync] Worker started — interval: ${intervalMinutes} min`);

  setTimeout(() => {
    syncAllSubscriptions().catch((err) => console.error('[sync] Initial run failed:', sanitizeError(err)));
  }, 10_000);

  setInterval(() => {
    syncAllSubscriptions().catch((err) => console.error('[sync] Scheduled run failed:', sanitizeError(err)));
  }, intervalMs);
}
