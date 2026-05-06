/** Shared mutable state between sync-worker and the sync/status API route. */
export const syncState: {
  intervalMinutes: number;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
} = {
  intervalMinutes: Math.max(1, parseInt(process.env.SYNC_INTERVAL_MINUTES ?? '60', 10)),
  nextRunAt: null,
  lastRunAt: null,
};
