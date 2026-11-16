/*
 * @/lib/social/auth, stood in for.
 *
 * The real module reaches Supabase on import. The suite is about the screen,
 * not the credentials, so the session is always "resolved and signed out" —
 * the state the login screen is for — and the two calls are recorded rather
 * than made. `?fail=1` drives the error block, which is markup the suite has
 * to be able to see.
 */
export type AuthOutcome = {
  ok: boolean;
  message: string;
  blame: 'you' | 'wait' | 'them' | 'setup';
  detail: string;
  needsEmailConfirm?: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __authCalls: string[] | undefined;
}

function record(name: string) {
  globalThis.__authCalls = globalThis.__authCalls ?? [];
  globalThis.__authCalls.push(name);
}

function outcome(): AuthOutcome {
  const fail = new URLSearchParams(location.search).get('fail');
  if (fail) {
    return {
      ok: false,
      message: 'לא הצלחנו להיכנס — השרת סירב',
      blame: fail === 'you' ? 'you' : 'them',
      detail: 'stub detail: upstream refused',
    };
  }
  return { ok: true, message: '', blame: 'you', detail: '' };
}

export async function signInToSocial(): Promise<AuthOutcome> {
  record('signIn');
  return outcome();
}

export async function signUpToSocial(): Promise<AuthOutcome> {
  record('signUp');
  return outcome();
}

export function useSocialSession() {
  return { session: null, loading: false };
}
