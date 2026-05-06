/**
 * Pure session utilities — no Next.js or DB dependencies.
 * Importable in both server code and test runner (tsx --test).
 */
import { verifySession } from '@/lib/encryption';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Verifies the HMAC signature and checks the server-side `iat` expiry.
 * Returns the parsed `userId`, or null if the session is invalid or expired.
 */
export function parseSession(token: string): { userId: string } | null {
  const payload = verifySession(token);
  if (!payload) return null;
  try {
    const data = JSON.parse(payload);
    if (!data.userId) return null;
    if (typeof data.iat === 'number') {
      const ageSecs = Math.floor(Date.now() / 1000) - data.iat;
      if (ageSecs > SESSION_MAX_AGE_SECONDS) return null;
    }
    return { userId: data.userId };
  } catch {
    return null;
  }
}

/** Basic AT Protocol DID validation (did:plc:… or did:web:…). */
export function isValidDid(did: string): boolean {
  return typeof did === 'string' && /^did:[a-z]+:[a-zA-Z0-9._:%-]{1,512}$/.test(did);
}

/**
 * Detects whether an error message indicates a missing OAuth scope.
 * Used in sync-worker to trigger app-password fallback.
 */
export function isScopeError(message: string): boolean {
  return message.includes('Missing required scope');
}

/**
 * Detects whether an error indicates the subscription target account is
 * permanently unavailable (deactivated, suspended, taken down, or deleted).
 * When true, the subscription should be paused rather than retried.
 */
export function isTargetUnavailableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes('AccountDeactivated') ||
    message.includes('AccountTakendown') ||
    message.includes('AccountSuspended') ||
    message.includes('ActorNotFound') ||
    lower.includes('profile not found') ||
    lower.includes('could not find user') ||
    lower.includes('actor not found') ||
    lower.includes('account has been deactivated') ||
    lower.includes('account has been suspended')
  );
}
