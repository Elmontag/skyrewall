import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { isValidDid } from '@/lib/session';
import { query } from '@/lib/db';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await query<{ id: string; target_did: string; note: string | null; created_at: string }>(
    `SELECT id, target_did, note, created_at FROM whitelists WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return NextResponse.json({ whitelists: rows });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { target_did?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { target_did, note } = body;
  if (!target_did || !isValidDid(target_did)) {
    return NextResponse.json({ error: 'Invalid DID' }, { status: 400 });
  }

  await query(
    `INSERT INTO whitelists (user_id, target_did, note) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [userId, target_did, note ?? null]
  );
  return NextResponse.json({ ok: true });
}
