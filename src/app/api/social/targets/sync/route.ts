import { errorResponse, requireAdmin } from '@/lib/social/server/auth';
import { activeAccount, syncAccount } from '@/lib/social/server/sync';

/** Re-reads permissions and managed Pages from Meta. */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const account = await activeAccount();
    if (!account) return Response.json({ error: 'אין חשבון פייסבוק מחובר.' }, { status: 400 });
    const result = await syncAccount(account.id);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
