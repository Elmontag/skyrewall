import { query } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { createAgent, fetchAllFollowers, blockAccounts, muteAccounts } from '@/lib/bluesky';

interface SyncRow {
  sub_id: string;
  target_handle: string;
  mode: string;
  include_followers: boolean;
  handle: string;
  encrypted_password: string;
}

async function syncAllSubscriptions(): Promise<void> {
  const rows = await query<SyncRow>(`
    SELECT s.id AS sub_id, s.target_handle, s.mode, s.include_followers,
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

      if (row.include_followers) {
        const followers = await fetchAllFollowers(agent, row.target_handle);
        dids = followers.map((f) => f.did);
      } else {
        const profile = await agent.getProfile({ actor: row.target_handle });
        dids = [profile.data.did];
      }

      if (dids.length > 0) {
        if (row.mode === 'block') {
          await blockAccounts(agent, dids);
        } else {
          await muteAccounts(agent, dids);
        }
      }

      await query('UPDATE subscriptions SET last_updated = NOW() WHERE id = $1', [row.sub_id]);

      console.log(`[sync] ✓ ${row.handle} → @${row.target_handle} (${row.mode}, ${dids.length} accounts)`);
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
