import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { query } from '@/lib/db';

interface DailyRow {
  date: string;
  action: string;
  count: string;
}

interface CountRow {
  count: string;
}

interface SourceRow {
  source: string;
  count: string;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [totals, rolling, bySource, daily] = await Promise.all([
    // Lifetime unique accounts per action
    query<{ action: string; count: string }>(
      `SELECT action, COUNT(DISTINCT target_did) as count FROM block_events WHERE user_id = $1 GROUP BY action`,
      [userId]
    ),
    // Rolling windows — unique accounts
    query<CountRow>(
      `SELECT
         COUNT(DISTINCT target_did) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')   AS today,
         COUNT(DISTINCT target_did) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS week,
         COUNT(DISTINCT target_did) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS month
       FROM block_events WHERE user_id = $1`,
      [userId]
    ),
    // Breakdown by source — unique accounts
    query<SourceRow>(
      `SELECT source, COUNT(DISTINCT target_did) as count FROM block_events WHERE user_id = $1 GROUP BY source`,
      [userId]
    ),
    // Daily counts last 30 days — unique accounts per day/action
    query<DailyRow>(
      `SELECT DATE(created_at) as date, action, COUNT(DISTINCT target_did) as count
       FROM block_events
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at), action
       ORDER BY date ASC`,
      [userId]
    ),
  ]);

  // Aggregate totals
  let totalBlock = 0;
  let totalMute = 0;
  for (const row of totals) {
    if (row.action === 'block') totalBlock = parseInt(row.count, 10);
    if (row.action === 'mute') totalMute = parseInt(row.count, 10);
  }

  // Rolling window
  const roll = rolling[0] as unknown as Record<string, string> | undefined;
  const todayCount = parseInt(roll?.today ?? '0', 10);
  const weekCount = parseInt(roll?.week ?? '0', 10);
  const monthCount = parseInt(roll?.month ?? '0', 10);

  // By source
  const sourceMap: Record<string, number> = { manual: 0, subscription: 0, reblock: 0, interaction: 0 };
  for (const row of bySource) {
    sourceMap[row.source] = parseInt(row.count, 10);
  }

  // Build daily chart data: merge block + mute per date
  const dateMap = new Map<string, { date: string; block: number; mute: number }>();
  for (const row of daily) {
    const d = dateMap.get(row.date) ?? { date: row.date, block: 0, mute: 0 };
    if (row.action === 'block') d.block += parseInt(row.count, 10);
    if (row.action === 'mute') d.mute += parseInt(row.count, 10);
    dateMap.set(row.date, d);
  }

  return NextResponse.json({
    total: totalBlock + totalMute,
    totalBlock,
    totalMute,
    todayCount,
    weekCount,
    monthCount,
    bySource: sourceMap,
    daily: Array.from(dateMap.values()),
  });
}
