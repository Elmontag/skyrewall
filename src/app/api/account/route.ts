import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { encrypt, decrypt, verifySession } from '@/lib/encryption';
import { BskyAgent } from '@atproto/api';
import { cookies } from 'next/headers';

interface UserRow {
  id: string;
  handle: string;
  encrypted_password: string;
}

async function getUser(): Promise<UserRow | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session) return null;
  try {
    const payload = verifySession(session.value);
    if (!payload) return null;
    const { userId } = JSON.parse(payload);
    const rows = await query<UserRow>(
      'SELECT id, handle, encrypted_password FROM users WHERE id = $1',
      [userId]
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ handle: user.handle });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await query('DELETE FROM users WHERE id = $1', [user.id]);

  const response = NextResponse.json({ success: true });
  response.cookies.delete('session');
  return response;
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const currentPassword = decrypt(user.encrypted_password);
    const agent = new BskyAgent({ service: 'https://bsky.social' });

    if (body.handle) {
      const newHandle: string = body.handle.trim();
      // Verify new handle with current stored password
      await agent.login({ identifier: newHandle, password: currentPassword });
      await query('UPDATE users SET handle = $1 WHERE id = $2', [newHandle, user.id]);
      return NextResponse.json({ success: true, updated: 'handle' });
    }

    if (body.password) {
      const newPassword: string = body.password.trim();
      // Verify current handle with new password
      await agent.login({ identifier: user.handle, password: newPassword });
      const encryptedPassword = encrypt(newPassword);
      await query('UPDATE users SET encrypted_password = $1 WHERE id = $2', [encryptedPassword, user.id]);
      return NextResponse.json({ success: true, updated: 'password' });
    }

    return NextResponse.json({ error: 'No field to update' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Authentication') || message.includes('Invalid')) {
      return NextResponse.json({ error: 'BlueSky credentials could not be verified.' }, { status: 401 });
    }
    console.error('[account PATCH] error:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
