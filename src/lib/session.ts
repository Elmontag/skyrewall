import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { decrypt, verifySession } from '@/lib/encryption';

interface SessionCredentials {
  handle: string;
  password: string;
}

/** Returns decrypted credentials from the current session, or null if not logged in. */
export async function getSessionCredentials(): Promise<SessionCredentials | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session');
  if (!session) return null;
  try {
    const payload = verifySession(session.value);
    if (!payload) return null;
    const { userId } = JSON.parse(payload);
    const rows = await query<{ handle: string; encrypted_password: string }>(
      'SELECT handle, encrypted_password FROM users WHERE id = $1',
      [userId]
    );
    if (rows.length === 0) return null;
    return { handle: rows[0].handle, password: decrypt(rows[0].encrypted_password) };
  } catch {
    return null;
  }
}

/** Basic AT Protocol DID validation (did:plc:… or did:web:…). */
export function isValidDid(did: string): boolean {
  return typeof did === 'string' && /^did:[a-z]+:[a-zA-Z0-9._:%-]{1,512}$/.test(did);
}
