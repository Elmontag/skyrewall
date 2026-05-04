import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/session';
import { query } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ did: string }> }) {
  void req; // params accessed via destructuring; req unused but required by Next.js signature
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { did } = await params;
  const decodedDid = decodeURIComponent(did);

  const result = await query<{ id: string }>(
    `DELETE FROM whitelists WHERE user_id = $1 AND target_did = $2 RETURNING id`,
    [userId, decodedDid]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
