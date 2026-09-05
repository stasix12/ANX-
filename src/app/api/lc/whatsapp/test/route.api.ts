import { bad, json, serviceClient } from '@/lib/lc/server';
import { requireMember } from '@/lib/lc/server/deps';
import { phoneInfo } from '@/lib/lc/server/whatsapp';

/**
 * POST /api/lc/whatsapp/test — validates credentials against the Graph API
 * before they are saved. { organizationId, phoneNumberId, accessToken }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { organizationId?: string; phoneNumberId?: string; accessToken?: string } | null;
  if (!body?.organizationId || !body.phoneNumberId || !body.accessToken) return bad('organizationId, phoneNumberId and accessToken are required');
  const client = serviceClient();
  if (!client) return bad('Supabase is not configured on the server', 503);
  const member = await requireMember(client, req.headers.get('authorization'), body.organizationId);
  if (!member) return bad('unauthorized', 401);
  try {
    const info = await phoneInfo({ phoneNumberId: body.phoneNumberId, accessToken: body.accessToken });
    return json({ ok: true, ...info, webhookUrl: `${new URL(req.url).origin}/api/lc/whatsapp/webhook` });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
}
