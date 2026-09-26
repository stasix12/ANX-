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
 * names". Two ways to be behind, and each is matched narrowly:
 *
 *   42P10 — the columns exist but no unique index covers them. A database that
 *           ran v15 (which adds tenant_id) and has not yet run v17.
 *   42703 — the column does not exist at all: a database that never ran v15.
 *           Proved by running the upsert against one. But 42703 is Postgres's
 *           code for ANY unknown column in the statement, and these upserts
 *           name plenty of others — fb_user_id, version, host, login_stage —
 *           each of which a database can also be behind on. Retrying those
 *           would be harmless in itself, except that the retry then fails with
 *           42P10 and THAT is the error the caller reports: a real "column X
 *           does not exist" replaced by a misleading one, and at the worker's
 *           startup by a Hebrew line telling the owner to run a migration they
 *           already ran. So 42703 counts only when the message is about
 *           tenant_id.
 *
 * The messages are checked as well because PostgREST has not always passed the
 * code through. Nothing else is treated as a reason to retry.
 */
const MISSING_TENANT_COLUMN = /column .?tenant_id.? does not exist/i;

export function isConflictTargetMismatch(error: Failed): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  if (error.code === '42P10') return true;
  if (error.code === '42703') return MISSING_TENANT_COLUMN.test(message);
  return /ON CONFLICT specification/i.test(message) || MISSING_TENANT_COLUMN.test(message);
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
