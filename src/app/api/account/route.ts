import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';
import { BskyAgent } from '@atproto/api';
import { getSessionUserId } from '@/lib/session';
import { checkApiRateLimit, rejectCrossOrigin, sanitizeError } from '@/lib/request-security';

interface UserRow {
  id: string;
  handle: string;
  encrypted_password: string | null;
}

async function getUser(): Promise<UserRow | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  try {
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

export async function DELETE(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = checkApiRateLimit(req, {
    scope: 'account:delete',
    identity: user.id,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  await query('DELETE FROM users WHERE id = $1', [user.id]);

  const response = NextResponse.json({ success: true });
  response.cookies.delete('session');
  return response;
}

export async function PATCH(req: NextRequest) {
  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = checkApiRateLimit(req, {
    scope: 'account:patch',
    identity: user.id,
    limit: 6,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  try {
    const body = await req.json();
    const agent = new BskyAgent({ service: 'https://bsky.social' });

    if (body.handle) {
      const newHandle: string = body.handle.trim();
      if (user.encrypted_password) {
        // App-password users: verify new handle with stored password
        const currentPassword = decrypt(user.encrypted_password);
        await agent.login({ identifier: newHandle, password: currentPassword });
      }
      // OAuth-only users: handle update accepted without password verification
      // (they proved identity via OAuth; handle is informational for display)
      try {
        await query('UPDATE users SET handle = $1 WHERE id = $2', [newHandle, user.id]);
      } catch (dbErr: unknown) {
        const msg = dbErr instanceof Error ? dbErr.message : '';
        if (msg.includes('unique') || msg.includes('duplicate')) {
          return NextResponse.json({ error: 'This handle is already registered.' }, { status: 409 });
        }
        throw dbErr;
      }
      return NextResponse.json({ success: true, updated: 'handle' });
    }

    if (body.password) {
      if (!user.encrypted_password) {
        return NextResponse.json(
          { error: 'OAuth accounts cannot set an app password here. Please use app-password login separately.' },
          { status: 400 }
        );
      }
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
    console.error('[account PATCH] error:', sanitizeError(err));
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
