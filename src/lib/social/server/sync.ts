import 'server-only';
import { REQUIRED_SCOPES, type PermissionStatus, type SocialAccount } from '../types';
import { deleteSecrets, readSecret, serviceDb, storeSecret } from './db';
import { GraphError, fetchManagedPages, fetchPermissions, revokeUserToken } from './graph';
import { logActivity } from './log';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * Pulls the connected account's permissions and managed Pages from Meta and
 * mirrors them into social_targets. Each page token is stored encrypted
 * under the target's id; the row itself carries only what the UI may show
 * (name, id, tasks, permission status).
 */

function statusFor(granted: string[], tasks: string[]): { status: PermissionStatus; canPublish: boolean } {
  const missingScope = REQUIRED_SCOPES.filter((s) => !granted.includes(s));
  const canCreate = tasks.includes('CREATE_CONTENT') || tasks.includes('MANAGE');
  if (missingScope.length === 0 && canCreate) return { status: 'ok', canPublish: true };
  return { status: 'missing_permissions', canPublish: false };
}

export async function syncAccount(accountId: string): Promise<{ pages: number; granted: string[]; declined: string[] }> {
  const db = serviceDb();
  const token = await readSecret('account', accountId);
  if (!token) throw new GraphError('אין טוקן שמור — יש להתחבר לפייסבוק.', 'auth', null, null);

  const permissions = await fetchPermissions(token);
  const pages = await fetchManagedPages(token);

  const seen: string[] = [];
  for (const page of pages) {
    const { status, canPublish } = statusFor(permissions.granted, page.tasks ?? []);
    const { data: existing } = await db
      .from('social_targets')
      .select('id')
      .eq('channel', 'facebook_page')
      .eq('external_id', page.id)
      .maybeSingle();
    const row = {
      account_id: accountId,
      channel: 'facebook_page' as const,
      external_id: page.id,
      name: page.name,
      url: page.link ?? `https://www.facebook.com/${page.id}`,
      tasks: page.tasks ?? [],
      permission_status: status,
      can_api_publish: canPublish,
      last_synced_at: new Date().toISOString(),
    };
    let targetId: string;
    if (existing) {
      await db.from('social_targets').update(row).eq('id', existing.id);
      targetId = existing.id;
    } else {
      const { data, error } = await db.from('social_targets').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      targetId = data.id;
    }
    seen.push(targetId);
    await storeSecret('target', targetId, page.access_token);
  }

  // Pages the user no longer manages lose their API status (rows stay for history).
  const { data: stale } = await db
    .from('social_targets')
    .select('id')
    .eq('account_id', accountId)
    .eq('channel', 'facebook_page');
  const staleIds = (stale ?? []).map((r) => r.id).filter((id) => !seen.includes(id));
  if (staleIds.length) {
    await db
      .from('social_targets')
      .update({ permission_status: 'revoked', can_api_publish: false, last_synced_at: new Date().toISOString() })
      .in('id', staleIds);
    await deleteSecrets('target', staleIds);
  }

  await db
    .from('social_accounts')
    .update({ granted_scopes: permissions.granted, declined_scopes: permissions.declined, last_synced_at: new Date().toISOString() })
    .eq('id', accountId);

  await logActivity('info', 'targets_synced', `סונכרנו ${pages.length} דפים מפייסבוק`, {
    pages: pages.length,
    granted: permissions.granted,
    declined: permissions.declined,
  });
  return { pages: pages.length, granted: permissions.granted, declined: permissions.declined };
}

/**
 * The connected Facebook account, with its two array columns guaranteed to BE
 * arrays.
 *
 * `granted_scopes` and `declined_scopes` are `not null default '{}'` in
 * supabase/social-schema.sql, but a row written before those columns existed —
 * or any future read that narrows the select — hands back undefined, and the
 * targets screen does `account.granted_scopes.filter(...)` on it. That is not a
 * Hebrew error message: it is Next's own English "This page couldn't load" over
 * an RTL app, on the one screen an owner goes to when Facebook is already not
 * working, and reloading re-reads the same row and crashes again.
 *
 * The type has always promised arrays here; this is the read keeping the
 * promise.
 */
export async function activeAccount(): Promise<SocialAccount | null> {
  const { data } = await serviceDb()
    .from('social_accounts')
    .select('*')
    .is('revoked_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const account = (data as SocialAccount | null) ?? null;
  if (!account) return null;
  return {
    ...account,
    granted_scopes: Array.isArray(account.granted_scopes) ? account.granted_scopes : [],
    declined_scopes: Array.isArray(account.declined_scopes) ? account.declined_scopes : [],
  };
}

/** Logout: ask Meta to drop the grant, then erase every stored token. */
export async function revokeAccount(accountId: string): Promise<void> {
  const db = serviceDb();
  const token = await readSecret('account', accountId);
  if (token) {
    try {
      await revokeUserToken(token);
    } catch (err) {
      await logActivity('warn', 'revoke_remote_failed', friendlyMessage(err, 'revoke failed'));
    }
  }
  const { data: targets } = await db.from('social_targets').select('id, channel').eq('account_id', accountId);
  const all = (targets ?? []) as { id: string; channel: string }[];
  /* Every token this account ever held goes, whatever it was attached to —
     deleting a credential is always right here. */
  await deleteSecrets('target', all.map((t) => t.id));
  await deleteSecrets('account', [accountId]);
  /*
   * ─── BUT ONLY THE API TARGETS ARE SWITCHED OFF ────────────────────────
   *
   * The dialog on /social/targets says, in these words: "פרסום לדפים ייפסק
   * עד שתתחברו שוב. פרסום בקבוצות לא מושפע." The code did not agree with
   * it. This update ran over EVERY target carrying this account_id, and the
   * worker stamps account_id onto group targets as well — so one tap on
   * "נתק ומחק טוקנים" set enabled = false on all 218 Facebook groups, which
   * are published by the browser on the owner's own PC and need no token at
   * all. Nothing anywhere turns them back on; the rounds simply stop, under
   * a dialog that promised they would not.
   *
   * A revoked Graph grant is a fact about API publishing. It says nothing
   * about a group a browser posts to, so a group's row is left exactly as it
   * was.
   */
  const apiIds = all.filter((t) => t.channel === 'facebook_page' || t.channel === 'instagram').map((t) => t.id);
  if (apiIds.length) {
    await db.from('social_targets').update({ permission_status: 'revoked', can_api_publish: false, enabled: false }).in('id', apiIds);
  }
  await db.from('social_accounts').update({ revoked_at: new Date().toISOString() }).eq('id', accountId);
  await logActivity('info', 'disconnected', 'החיבור לפייסבוק נותק וכל הטוקנים נמחקו');
}
