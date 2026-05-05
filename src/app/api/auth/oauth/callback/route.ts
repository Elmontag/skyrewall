import { NextRequest, NextResponse } from 'next/server';
import { Agent } from '@atproto/api';
import { deleteOAuthSession, getOAuthClient } from '@/lib/oauth-client';
import { query } from '@/lib/db';
import { decrypt, signSession } from '@/lib/encryption';
import { SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from '@/lib/session-cookie';
import { isValidDid } from '@/lib/session';
import { createAgent } from '@/lib/bluesky';
import { sanitizeError } from '@/lib/request-security';

interface UserRow {
  id: string;
  handle: string;
  encrypted_password: string | null;
  did: string | null;
}

export async function GET(req: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const params = req.nextUrl.searchParams;

  try {
    const client = getOAuthClient();
    const { session } = await client.callback(params);

    const did: string = session.did;

    // Reject malformed DIDs before touching the DB
    if (!isValidDid(did)) {
      throw new Error(`OAuth returned invalid DID: ${did}`);
    }

    // Restore the OAuth session to get an agent for profile lookup
    let handle = '';
    try {
      const oauthSession = await client.restore(did);
      const agent = new Agent(oauthSession);
      const profile = await agent.getProfile({ actor: did });
      handle = profile.data.handle ?? '';
    } catch {
      // Handle lookup is best-effort; fall back to empty string (DID-only match will still work)
    }

    // 1. Try to find an existing account by DID
    let rows = await query<UserRow>('SELECT id, handle, encrypted_password, did FROM users WHERE did = $1', [did]);

    // 2. Link existing app-password accounts only when their stored credentials
    // still prove ownership of this same DID. Do not link by handle alone.
    if (rows.length === 0 && handle) {
      const handleRows = await query<UserRow>(
        'SELECT id, handle, encrypted_password, did FROM users WHERE handle = $1',
        [handle]
      );
      const existing = handleRows[0];
      if (existing?.encrypted_password && !existing.did) {
        try {
          const agent = await createAgent(handle, decrypt(existing.encrypted_password));
          if (agent.session?.did === did) {
            await query('UPDATE users SET did = $1 WHERE id = $2', [did, existing.id]);
            rows = [{ ...existing, did }];
          }
        } catch {
          // Do not link on verification failure.
        }
      } else if (existing?.did === did) {
        rows = [existing];
      }
      if (existing && rows.length === 0) {
        await deleteOAuthSession(did);
        throw new Error('OAuth handle is already registered to a different local identity.');
      }
    }

    let user: UserRow;

    if (rows.length > 0) {
      user = rows[0];
    } else {
      // Cannot create a usable account without a handle; profile lookup must have failed.
      if (!handle) {
        throw new Error('Could not retrieve Bluesky handle from profile. Please try again.');
      }
      // Privacy policy must have been accepted at OAuth start time for new registrations.
      const consentCookie = req.cookies.get('oauth_reg_consent');
      if (!consentCookie || consentCookie.value !== '1') {
        await deleteOAuthSession(did);
        const errorUrl = `${appUrl}/?tab=account&oauth_error=consent`;
        const noConsentResponse = NextResponse.redirect(errorUrl);
        noConsentResponse.cookies.delete('oauth_reg_consent');
        return noConsentResponse;
      }
      // Create a new account for this OAuth user (no app-password)
      const created = await query<UserRow>(
        `INSERT INTO users (handle, did, encrypted_password)
         VALUES ($1, $2, NULL)
         RETURNING id, handle, encrypted_password, did`,
        [handle, did]
      );
      user = created[0];
    }

    const sessionData = signSession(
      JSON.stringify({ userId: user.id, iat: Math.floor(Date.now() / 1000) })
    );

    // Return a 200 HTML meta-refresh instead of a 302 redirect so that
    // the Set-Cookie header is reliably forwarded by reverse proxies (e.g.
    // Nginx Proxy Manager). Some proxies silently drop Set-Cookie on 3xx
    // redirect responses.
    const safeUrl = `${appUrl}/?tab=account`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safeUrl}"></head><body></body></html>`;
    const response = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    response.cookies.set('session', sessionData, {
      ...sessionCookieOptions,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    response.cookies.delete('oauth_reg_consent');
    return response;
  } catch (err) {
    console.error('[oauth/callback] error:', sanitizeError(err));
    const errorUrl = `${appUrl}/?tab=account&oauth_error=1`;
    return NextResponse.redirect(errorUrl);
  }
}
