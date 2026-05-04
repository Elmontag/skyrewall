export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb } = await import('@/lib/db');
    await initDb();

    const { startSyncWorker } = await import('@/lib/sync-worker');
    startSyncWorker();
  }
}
