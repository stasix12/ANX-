import { errorResponse, isPlatformAdmin, requireAdmin } from '@/lib/social/server/auth';
import { serviceDb } from '@/lib/social/server/db';
import { WORKER_OFFLINE_AFTER_SECONDS, type AdminPresence, type AdminUserPresence, type AdminWorkerPresence } from '@/lib/social/types';

/**
 * ─── WHO IS CONNECTED, AND UNDER WHICH USER — THE OWNER'S PANEL ─────────────
 *
 * "ותוסיף רק אצלי, לא אצל הלקוחות."
 *
 * This is the one route in the product whose answer deliberately spans every
 * business, so it is the one route that may not stop at requireAdmin(): that
 * guard means "signed in", and every customer is signed in. See
 * server/auth.ts — the allowlist is an environment variable precisely because
 * nothing reachable from inside a business may decide who sees across them.
 *
 * A SIGNED-IN CUSTOMER GETS 200 AND AN EMPTY HAND, not a 403. The client
 * helper folds a status code into a Hebrew sentence, so a 403 would arrive at
 * the settings screen as an error to display; `admin: false` arrives as data,
 * and the screen simply draws no panel. Nothing in the empty payload says
 * whether anybody else is connected, or that anybody else exists.
 *
 * It reads with the service role because RLS is doing its job: the owner's own
 * token can see the owner's own business and nothing more, which is exactly
 * what makes this question unanswerable from the client. The gate above is
 * therefore the whole of the security, and it is checked on the user Supabase
 * itself resolved from the token — never on anything the browser said about
 * who it is.
 */

/* Why these columns and not `*`: login_shot holds a screenshot of whatever
   Facebook was asking during a login challenge and can show a person's own
   screen; secrets live in social_secrets and are not here at all. A panel
   about presence asks for presence. */
const WORKER_COLUMNS =
  'id, name, host, version, status, browser_state, attention_message, last_seen_at, current_job_id, tenant_id, fb_user_id, fb_user_name';

/* Named caps. The lists are small today — one business, a handful of machines
   — but a panel that silently showed the first N while reading "who is
   connected" would be lying by omission, so the payload carries a flag and the
   screen says so out loud. */
const WORKER_LIMIT = 200;
const USER_PAGE = 200;

type WorkerRow = {
  id: string;
  name: string | null;
  host: string | null;
  version: string | null;
  status: string | null;
  browser_state: string | null;
  attention_message: string | null;
  last_seen_at: string | null;
  current_job_id: string | null;
  tenant_id: string | null;
  fb_user_id: string | null;
  fb_user_name: string | null;
};

export async function GET(request: Request) {
  try {
    const user = await requireAdmin(request);
    const now = new Date();
    if (!isPlatformAdmin(user)) {
      const closed: AdminPresence = { admin: false, now: now.toISOString(), workers: [], users: [], truncated: { workers: false, users: false } };
      return Response.json(closed);
    }

    const db = serviceDb();

    /* Newest heartbeat first, so the machines that are actually running are at
       the top of a list that may one day be long. */
    const workersRes = await db
      .from('social_workers')
      .select(WORKER_COLUMNS)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(WORKER_LIMIT);
    if (workersRes.error) throw new Error(workersRes.error.message);
    const rows = (workersRes.data ?? []) as unknown as WorkerRow[];

    const tenantsRes = await db.from('social_tenants').select('id, name');
    if (tenantsRes.error) throw new Error(tenantsRes.error.message);
    const tenantName = new Map<string, string>();
    for (const t of (tenantsRes.data ?? []) as { id: string; name: string | null }[]) tenantName.set(t.id, t.name ?? '');

    const membersRes = await db.from('social_tenant_members').select('tenant_id, user_id');
    if (membersRes.error) throw new Error(membersRes.error.message);
    const tenantsOfUser = new Map<string, string[]>();
    for (const m of (membersRes.data ?? []) as { tenant_id: string; user_id: string }[]) {
      const list = tenantsOfUser.get(m.user_id) ?? [];
      /* The business's NAME, or its id when the row has no name yet — the
         panel never shows a blank where a business should be. */
      list.push(tenantName.get(m.tenant_id) || m.tenant_id);
      tenantsOfUser.set(m.user_id, list);
    }

    const cutoff = now.getTime() - WORKER_OFFLINE_AFTER_SECONDS * 1000;
    const workers: AdminWorkerPresence[] = rows.map((w) => ({
      id: w.id,
      name: w.name ?? '',
      host: w.host ?? '',
      version: w.version ?? '',
      status: (w.status ?? 'offline') as AdminWorkerPresence['status'],
      browser_state: (w.browser_state ?? 'unknown') as AdminWorkerPresence['browser_state'],
      attention_message: w.attention_message ?? '',
      last_seen_at: w.last_seen_at,
      /* THE SAME TWO HALVES listWorkers() requires — a fresh stamp with status
         'offline' is a clean shutdown, a stale stamp with status 'online' is a
         machine that stopped answering mid-sentence. One definition of
         "מחובר" in the product, not two. */
      online: Boolean(w.last_seen_at && new Date(w.last_seen_at).getTime() > cutoff) && w.status !== 'offline',
      busy: Boolean(w.current_job_id),
      tenantId: w.tenant_id,
      tenantName: w.tenant_id ? (tenantName.get(w.tenant_id) ?? '') : '',
      fbUserId: w.fb_user_id ?? '',
      fbUserName: w.fb_user_name ?? '',
    }));

    /* Supabase's admin list is the only place the dashboard logins live; there
       is no users table of our own to join. One page, with the flag set when
       it came back full, because a second page silently dropped is the same
       lie as a truncated worker list. */
    const usersRes = await db.auth.admin.listUsers({ page: 1, perPage: USER_PAGE });
    if (usersRes.error) throw new Error(usersRes.error.message);
    const authUsers = usersRes.data?.users ?? [];
    const users: AdminUserPresence[] = authUsers
      .map((u) => ({
        id: u.id,
        email: u.email ?? '',
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
        tenants: tenantsOfUser.get(u.id) ?? [],
      }))
      .sort((a, b) => (b.lastSignInAt ?? '').localeCompare(a.lastSignInAt ?? ''));

    const payload: AdminPresence = {
      admin: true,
      now: now.toISOString(),
      workers,
      users,
      truncated: { workers: rows.length >= WORKER_LIMIT, users: authUsers.length >= USER_PAGE },
    };
    return Response.json(payload);
  } catch (err) {
    return errorResponse(err);
  }
}
