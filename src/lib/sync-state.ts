/** Shared mutable state between sync-worker and the sync/status API route.
 *
 * Uses globalThis as the backing store so the same object is shared across
 * Next.js module instances within the same Node.js process. Without this,
 * instrumentation.ts (which runs startSyncWorker) and the API route handler
 * each get their own copy of this module, and writes from the worker are
 * invisible to the route.
 */
type SyncState = { intervalMinutes: number; nextRunAt: Date | null; lastRunAt: Date | null };

const g = globalThis as typeof globalThis & { __skyrewallSyncState?: SyncState };

if (!g.__skyrewallSyncState) {
  g.__skyrewallSyncState = {
    intervalMinutes: Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '60', 10)),
    nextRunAt: null,
    lastRunAt: null,
  };
}

export const syncState: SyncState = g.__skyrewallSyncState;
