import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

type RateLimitConfig = {
  scope: string;
  identity?: string | null;
  limit: number;
  windowMs: number;
};

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

  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const expected = `${proto}://${host}`;

  if (origin !== expected) {
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

