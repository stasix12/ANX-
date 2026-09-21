import 'server-only';
import { cookies } from 'next/headers';
import { randomToken, sign, verifySignature } from './crypto';

/**
 * OAuth state handling. The state is random, signed with the server key and
 * stored in an httpOnly cookie; the callback must present the same value in
 * the query string. That ties the callback to the browser that started the
 * flow (CSRF protection) without any server-side session store.
 */
export const STATE_COOKIE = 'social_fb_oauth_state';
const STATE_TTL_SECONDS = 10 * 60;

export async function issueState(): Promise<string> {
  const state = randomToken();
  const store = await cookies();
  store.set(STATE_COOKIE, `${state}.${sign(state)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/social/facebook',
    maxAge: STATE_TTL_SECONDS,
  });
  return state;
}

export async function consumeState(given: string | null): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value ?? '';
  store.delete(STATE_COOKIE);
  if (!given || !raw) return false;
  const [state, signature] = raw.split('.');
  if (!state || !signature) return false;
  return state === given && verifySignature(state, signature);
}

/** Exact redirect URI — must match the one whitelisted in the Meta app. */
export function redirectUri(request: Request): string {
  if (process.env.FACEBOOK_REDIRECT_URI) return process.env.FACEBOOK_REDIRECT_URI;
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  return `${proto}://${host}/api/social/facebook/callback`;
}
