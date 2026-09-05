import { bad, json, serviceClient } from '@/lib/lc/server';
import { loadIntegration, requireMember } from '@/lib/lc/server/deps';
import { sendTemplate, sendText, waConfigOf } from '@/lib/lc/server/whatsapp';

/**
 * POST /api/lc/whatsapp/send — outbound message from the app (owner reply,
 * agent reply produced in the browser, automation run).
 *
 * Authenticated with the signed-in user's Supabase JWT; the server checks
 * membership, applies WhatsApp's 24-hour customer-service window and falls
 * back to the approved template when the window is closed.
 *
 * { organizationId, to, text, language?, lastCustomerMessageAt?, template? }
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { organizationId?: string; to?: string; text?: string; language?: string; lastCustomerMessageAt?: string; template?: string } | null;
  if (!body?.organizationId || !body.to || !body.text) return bad('organizationId, to and text are required');
  const client = serviceClient();
  if (!client) return bad('Supabase is not configured on the server', 503);
  const member = await requireMember(client, req.headers.get('authorization'), body.organizationId);
  if (!member) return bad('unauthorized', 401);
  const integration = await loadIntegration(client, body.organizationId, 'whatsapp_cloud');
  const cfg = waConfigOf(integration);
  if (!cfg || integration?.status !== 'connected') return json({ ok: false, error: 'whatsapp_not_connected' }, 409);

  const windowOpen = body.lastCustomerMessageAt ? Date.now() - new Date(body.lastCustomerMessageAt).getTime() < WINDOW_MS : false;
  try {
    if (windowOpen) {
      const r = await sendText(cfg, body.to, body.text);
      return json({ ok: true, id: r.id, mode: 'text' });
    }
    if (body.template) {
      const r = await sendTemplate(cfg, body.to, body.template, body.language ?? 'he', body.text);
      return json({ ok: true, id: r.id, mode: 'template' });
    }
    return json({ ok: false, error: 'outside_24h_window_no_template' }, 422);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await client.from('lc_integrations').update({ last_error: message, updated_at: new Date().toISOString() }).eq('id', integration.id);
    return json({ ok: false, error: message }, 502);
  }
}
