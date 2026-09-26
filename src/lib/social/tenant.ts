/*
 * UPSERTS THAT SURVIVE THE MIGRATION THAT IS NOT RUN YET.
 *
 * Four uniqueness rules in this database were written when one person used it:
 * one settings row per key, one group per (channel, external id), one worker
 * per PC name, one Facebook account per id. supabase/social-schema-v17.sql
 * widens all four to "unique WITHIN a business", because two businesses
 * advertising in the same public group — or two customers whose PC is called
 * DESKTOP-4F2A — is the normal case and not an edge one.
 *
 * Widening them changes what an upsert has to name. `on conflict (key)` stops
 * matching anything the moment the key is (tenant_id, key), and PostgREST
 * answers 42P10: "there is no unique or exclusion constraint matching the ON
 * CONFLICT specification". Saving a setting would simply fail.
 *
 * And the database is not upgraded by the same act that deploys this code. The
 * owner pastes the SQL into Supabase by hand, on their own day; the site
 * deploys when a commit lands; the worker updates when the PC restarts. Any
 * order is possible, including "site first, SQL later" — which is exactly the
 * situation that once had one screen asking for v13 while another asked for
 * v14.
 *
 * So the conflict target is not assumed. The wide one is tried, and ONLY the
 * one error that means "this database has not run v17 yet" sends it back to
 * the narrow one. Every other error is returned untouched, because an upsert
 * that quietly retries a real failure is worse than one that fails.
 *
 * Once v17 has run the first attempt succeeds and there is no second call.
 */

type Failed = { code?: string | null; message?: string | null } | null;

/**
 * True only for "this database does not have the key the conflict target
 * names". Two codes, because there are two ways to be behind:
 *
 *   42P10 — the columns exist but no unique index covers them. A database that
 *           ran v15 (which adds tenant_id) and has not yet run v17.
 *   42703 — the column does not exist at all. A database that has not run v15
 *           either. Proved by running the upsert against one.
 *
 * The message is checked as well because PostgREST has not always passed the
 * code through. Nothing else is treated as a reason to retry.
 */
export function isConflictTargetMismatch(error: Failed): boolean {
  if (!error) return false;
  if (error.code === '42P10' || error.code === '42703') return true;
  return /ON CONFLICT specification/i.test(error.message ?? '') || /column "tenant_id" does not exist/i.test(error.message ?? '');
}

/**
 * Runs the upsert with the per-business conflict target, falling back to the
 * old whole-database one on a database where v17 has not been run.
 *
 * `run` is given the target rather than a built query so that the caller keeps
 * whatever it chains after the upsert — `.select(...).single()` and the rest.
 */
export async function upsertScoped<T extends { error: Failed }>(
  run: (onConflict: string) => PromiseLike<T>,
  scoped: string,
  legacy: string,
): Promise<T> {
  const first = await run(scoped);
  if (!isConflictTargetMismatch(first.error)) return first;
  return run(legacy);
}
