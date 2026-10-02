import { errorResponse, requireAdmin } from '@/lib/social/server/auth';
import { activeAccount } from '@/lib/social/server/sync';

/**
 * Server-side configuration check for the targets screen: which env vars
 * are present (never their values) and whether an account is connected.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const account = await activeAccount();
    return Response.json({
      configured: {
        facebookApp: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
        serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        encryptionKey: Boolean(process.env.SOCIAL_ENCRYPTION_KEY),
        cronSecret: Boolean(process.env.SOCIAL_CRON_SECRET),
      },
      account,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
