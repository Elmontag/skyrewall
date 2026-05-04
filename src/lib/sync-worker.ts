import { query } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { createAgent, fetchAllFollowers, blockAccounts, muteAccounts, fetchBlockedByFromClearSky, enrichProfileBatch } from '@/lib/bluesky';

interface SyncRow {
  sub_id: string;
  user_id: string;
  target_handle: string;
  mode: string;
  sub_type: string;
  include_followers: boolean;
  handle: string;
  encrypted_password: string;
}

async function logSyncEvents(
  userId: string,
  dids: string[],
  action: 'block' | 'mute',
  source: 'subscription' | 'reblock'
) {
  if (dids.length === 0) return;
  try {
    const values = dids.map((_, i) => `('${userId}', $${i + 1}, '${action}', '${source}')`).join(', ');
    await query(
      `INSERT INTO block_events (user_id, target_did, action, source) VALUES ${values} ON CONFLICT DO NOTHING`,
      dids
    );
  } catch {
    // Non-fatal
  }
}

async function syncAllSubscriptions(): Promise<void> {
  const rows = await query<SyncRow>(`
    SELECT s.id AS sub_id, s.user_id, s.target_handle, s.mode, s.sub_type, s.include_followers,
           u.handle, u.encrypted_password
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
  `);

  if (rows.length === 0) return;

  console.log(`[sync] Processing ${rows.length} subscription(s)...`);

  for (const row of rows) {
    try {
      const password = decrypt(row.encrypted_password);
      const agent = await createAgent(row.handle, password);

      let dids: string[];

      if (row.sub_type === 'reblock') {
        // Use ClearSky to get who blocks this user, then block them back
        dids = await fetchBlockedByFromClearSky(row.handle);
        if (dids.length > 0) {
          // Enrich for logging purposes only; block by DID directly
          await enrichProfileBatch(agent, dids.slice(0, 5)); // warm-up only
        }
      } else if (row.include_followers) {
        const followers = await fetchAllFollowers(agent, row.target_handle);
        dids = followers.map((f) => f.did);
      } else {
        const profile = await agent.getProfile({ actor: row.target_handle });
        dids = [profile.data.did];
      }

      if (dids.length > 0) {
        const action = row.mode as 'block' | 'mute';
        const source = row.sub_type === 'reblock' ? 'reblock' : 'subscription';

        if (action === 'block') {
          await blockAccounts(agent, dids);
        } else {
          await muteAccounts(agent, dids);
        }

        await logSyncEvents(row.user_id, dids, action, source as 'subscription' | 'reblock');
      }

      await query('UPDATE subscriptions SET last_updated = NOW() WHERE id = $1', [row.sub_id]);

      console.log(`[sync] ✓ ${row.handle} → @${row.target_handle} (${row.mode}/${row.sub_type}, ${dids.length} accounts)`);
    } catch (err) {
      console.error(`[sync] ✗ subscription ${row.sub_id} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

export function startSyncWorker(): void {
  const intervalMinutes = Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '60', 10));
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[sync] Worker started — interval: ${intervalMinutes} min`);

  // Initial run shortly after startup, then on schedule
  setTimeout(() => {
    syncAllSubscriptions().catch((err) => console.error('[sync] Initial run failed:', err));
  }, 10_000);

  setInterval(() => {
    syncAllSubscriptions().catch((err) => console.error('[sync] Scheduled run failed:', err));
  }, intervalMs);
}
