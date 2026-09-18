import 'server-only';
import { REQUIRED_SCOPES, type PermissionStatus, type SocialAccount } from '../types';
import { deleteSecrets, readSecret, serviceDb, storeSecret } from './db';
import { GraphError, fetchManagedPages, fetchPermissions, revokeUserToken } from './graph';
import { logActivity } from './log';

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

export async function activeAccount(): Promise<SocialAccount | null> {
  const { data } = await serviceDb()
    .from('social_accounts')
    .select('*')
    .is('revoked_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SocialAccount | null) ?? null;
}

/** Logout: ask Meta to drop the grant, then erase every stored token. */
export async function revokeAccount(accountId: string): Promise<void> {
  const db = serviceDb();
  const token = await readSecret('account', accountId);
  if (token) {
    try {
      await revokeUserToken(token);
    } catch (err) {
      await logActivity('warn', 'revoke_remote_failed', err instanceof Error ? err.message : 'revoke failed');
    }
  }
  const { data: targets } = await db.from('social_targets').select('id').eq('account_id', accountId);
  const ids = (targets ?? []).map((t) => t.id);
  await deleteSecrets('target', ids);
  await deleteSecrets('account', [accountId]);
  if (ids.length) {
    await db.from('social_targets').update({ permission_status: 'revoked', can_api_publish: false, enabled: false }).in('id', ids);
  }
  await db.from('social_accounts').update({ revoked_at: new Date().toISOString() }).eq('id', accountId);
  await logActivity('info', 'disconnected', 'החיבור לפייסבוק נותק וכל הטוקנים נמחקו');
}
