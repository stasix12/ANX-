import { serviceDb, storeSecret } from '@/lib/social/server/db';
import { exchangeCode, exchangeForLongLived, graph } from '@/lib/social/server/graph';
import { logActivity } from '@/lib/social/server/log';
import { consumeState, redirectUri } from '@/lib/social/server/oauth';
import { syncAccount } from '@/lib/social/server/sync';

/**
 * Step 2 of Facebook Login. Verifies the CSRF state, swaps the code for a
 * short-lived user token, upgrades it to a long-lived one (~60 days), stores
 * it encrypted, then mirrors the managed Pages. Page tokens derived from a
 * long-lived user token do not expire on their own.
 *
 * Nothing sensitive ever reaches the browser: the redirect back to the app
 * carries only a status flag.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (params: Record<string, string>) => {
    const dest = new URL('/social/targets', url.origin);
    for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
    return Response.redirect(dest.toString(), 302);
  };

  try {
    if (url.searchParams.get('error')) {
      const reason = url.searchParams.get('error_description') ?? url.searchParams.get('error_reason') ?? 'declined';
      await logActivity('warn', 'connect_declined', `ההתחברות לפייסבוק לא הושלמה: ${reason}`);
      return back({ connect: 'declined' });
    }
    if (!(await consumeState(url.searchParams.get('state')))) {
      await logActivity('warn', 'connect_state_mismatch', 'state של OAuth לא תואם — הבקשה נדחתה');
      return back({ connect: 'state' });
    }
    const code = url.searchParams.get('code');
    if (!code) return back({ connect: 'missing_code' });

    const short = await exchangeCode(code, redirectUri(request));
    const long = await exchangeForLongLived(short.access_token);
    const token = long.access_token;
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null;

    const me = await graph<{ id: string; name: string }>('me', { token, params: { fields: 'id,name' } });

    const db = serviceDb();
    const { data: account, error } = await db
      .from('social_accounts')
      .upsert(
        {
          provider: 'facebook',
          provider_user_id: me.id,
          name: me.name,
          token_expires_at: expiresAt,
          connected_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: 'provider,provider_user_id' },
      )
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    await storeSecret('account', account.id, token);
    await logActivity('info', 'connected', `החשבון "${me.name}" חובר לפייסבוק`, { expiresAt });
    const synced = await syncAccount(account.id);
    return back({ connect: 'ok', pages: String(synced.pages) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'connect failed';
    await logActivity('error', 'connect_failed', message);
    return back({ connect: 'error', message: message.slice(0, 200) });
  }
}
