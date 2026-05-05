import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

type RateLimitConfig = {
  scope: string;
  identity?: string | null;
  limit: number;
  windowMs: number;
};

/**
 * Returns the client IP from X-Forwarded-For / X-Real-IP headers.
 * NOTE: X-Forwarded-For can be spoofed by clients unless a trusted reverse
 * proxy (Nginx, Traefik, …) strips/overwrites the header before it reaches
 * the app. Use per-handle rate limiting in addition to per-IP limiting for
 * sensitive endpoints.
 */
export function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export function rejectCrossOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;

  const host = req.headers.get('host');
  if (!host) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });

  // Compare only the host part of the Origin header (ignoring protocol).
  // Behind reverse proxies (e.g. Nginx Proxy Manager) the internal protocol
  // is always http:// while the browser Origin carries https://, so a full
  // proto+host comparison would produce false-positive 403 errors.
  // SameSite=Strict on the session cookie is the primary CSRF defence.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  if (originHost !== host) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  return null;
}

export function checkApiRateLimit(
  req: NextRequest,
  { scope, identity, limit, windowMs }: RateLimitConfig
): NextResponse | null {
  const key = `${scope}:${identity || getClientIp(req)}`;
  const result = checkRateLimit(key, limit, windowMs);

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfter ?? 60) } }
    );
  }

  return null;
}

export function sanitizeError(err: unknown): string {
  if (!(err instanceof Error)) return 'Unknown error';
  return err.message
    .replace(/password\s*[:=]\s*[^,\s}]+/gi, 'password=***')
    .replace(/identifier\s*[:=]\s*[^,\s}]+/gi, 'identifier=***')
    .replace(/handle\s*[:=]\s*[^,\s}]+/gi, 'handle=***');
}

