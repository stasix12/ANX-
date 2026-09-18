import { errorResponse, requireAdmin } from '@/lib/social/server/auth';
import { activeAccount, revokeAccount } from '@/lib/social/server/sync';

/** Logout from Facebook: revoke the grant at Meta and wipe every stored token. */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const account = await activeAccount();
    if (account) await revokeAccount(account.id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
