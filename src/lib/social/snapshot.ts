'use client';

import { supabase } from '@/lib/supabase';

/**
 * WHAT A SCREEN LOOKED LIKE LAST TIME, so going back to it does not start at a
 * skeleton.
 *
 * THE PROBLEM, in the owner's words: "המעבר בין לחיצה ללחיצה, בין מסכים,
 * פעולות ותגובות" is slow. Every screen in this module is a client component
 * that mounts with its data at `null`, draws a skeleton, and fetches. So
 * tapping "קבוצות" and then "ראשי" again — two seconds apart, with nothing
 * changed — paid for the dashboard's twenty-one reads a second time and
 * showed a shimmer while they ran. The screen was always a fresh boot.
 *
 * THIS IS NOT A DATA CACHE AND IT MUST NOT BECOME ONE. Nothing here is ever
 * read INSTEAD of the database. Every screen still runs exactly the same
 * load() on exactly the same schedule; the only thing that changes is what is
 * on screen during the first few hundred milliseconds of it — the last
 * answer the database gave, instead of a shimmer. The moment the real read
 * lands it replaces this, as it always did.
 *
 * THE PRECEDENT IS IN THIS REPO. useAdminSession caches the resolved session
 * in a module variable for exactly this reason, and its comment says why:
 * "without the cache each navigation started at loading=true — flashing a
 * full-page spinner on every tab switch." This is the same idea one layer up.
 *
 * WHY A MODULE VARIABLE AND NOT localStorage. A reload is a new session and
 * SHOULD start from the database: anything written to disk would outlive the
 * tab, the sign-in and the account, and "fast" is not worth a screen that can
 * show a previous person's numbers. This dies with the page.
 *
 * AND IT IS DROPPED THE INSTANT THE ACCOUNT CHANGES — see below. A snapshot
 * belongs to whoever was signed in when it was taken.
 */

const store = new Map<string, unknown>();

/** Which account the snapshots in `store` belong to; null before sign-in. */
let owner: string | null = null;

/**
 * Everything is thrown away when the signed-in user changes.
 *
 * Sign out, sign in as somebody else, and a screen seeded from this cache
 * would paint the previous account's campaigns for the split second before
 * their own read lands. That is a worse failure than any skeleton, and RLS
 * does not protect against it — the rows were legitimately read, by the
 * person who was there a moment ago.
 *
 * A TOKEN REFRESH IS NOT AN ACCOUNT CHANGE. Supabase fires TOKEN_REFRESHED
 * roughly hourly with the same user; comparing the user id rather than
 * reacting to the event is what keeps an hourly refresh from emptying the
 * cache under a screen that is using it.
 */
supabase?.auth.onAuthStateChange((_event, session) => {
  const next = session?.user?.id ?? null;
  if (next !== owner) {
    store.clear();
    owner = next;
  }
});

/**
 * The last value a screen stored, or null.
 *
 * Call it from a useState initialiser, never during a later render: the value
 * is deliberately mutable module state, and reading it mid-render would make
 * two renders of the same component disagree.
 */
export function readSnapshot<T>(key: string): T | null {
  return (store.get(key) as T | undefined) ?? null;
}

/** Keep what a successful load produced, for the next time this screen opens. */
export function writeSnapshot<T>(key: string, value: T): void {
  store.set(key, value);
}

/**
 * Forget one screen's snapshot.
 *
 * For the case where a screen knows its own last answer is no longer worth
 * showing — the owner has just deleted the thing it was about — and would
 * rather open on a skeleton than on something that is gone.
 */
export function dropSnapshot(key: string): void {
  store.delete(key);
}

/** Keys, in one place, so two screens cannot quietly share one by accident. */
export const SNAPSHOT = {
  dashboard: 'social:dashboard',
  campaigns: 'social:campaigns',
  groups: 'social:groups',
  library: 'social:library',
} as const;
