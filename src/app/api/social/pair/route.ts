import { HttpError, errorResponse, requireAdmin } from '@/lib/social/server/auth';
import { serviceDb } from '@/lib/social/server/db';

/*
 * קוד חיבור ל-worker בענן — בלי שאף אחד נוגע בסיסמה של הלקוח.
 *
 * WHAT COMES BACK is Supabase's own single-use magic-link token hash for the
 * CALLER's email: pasted into the worker container's SOCIAL_WORKER_PAIRING,
 * it buys exactly one session (worker/db.ts exchanges and the volume keeps
 * the session from then on). It expires on the project's OTP clock (an hour
 * by default) and dies on first use — a leaked, already-used value opens
 * nothing.
 *
 * WHO CAN MINT ONE: only a signed-in user, only for their own email —
 * requireAdmin hands us the verified user and nothing in the request chooses
 * the account. The service role is what generateLink needs, and it never
 * leaves this route.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request);
    if (!user.email) throw new HttpError(400, 'לחשבון אין כתובת מייל — אי אפשר להנפיק קוד חיבור.');
    const { data, error } = await serviceDb().auth.admin.generateLink({ type: 'magiclink', email: user.email });
    if (error || !data?.properties?.hashed_token) {
      throw new HttpError(500, `יצירת קוד החיבור נכשלה: ${error?.message ?? 'תשובה ריקה מהשרת'}`);
    }
    return Response.json({ code: data.properties.hashed_token, expiresInMinutes: 60 });
  } catch (err) {
    return errorResponse(err);
  }
}
