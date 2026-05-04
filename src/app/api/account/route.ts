import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifySession } from '@/lib/encryption';
import { cookies } from 'next/headers';

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session) return null;
  try {
    const payload = verifySession(session.value);
    if (!payload) return null;
    const { userId } = JSON.parse(payload);
    return userId;
  } catch {
    return null;
  }
}

export async function DELETE() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query('DELETE FROM users WHERE id = $1', [userId]);

  const response = NextResponse.json({ success: true });
  response.cookies.delete('session');
  return response;
}
