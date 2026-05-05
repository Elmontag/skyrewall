import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const sessionCookieOptions: Partial<ResponseCookie> = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: '/',
};

