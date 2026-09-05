import { supabaseInboundDeps } from '@/lib/lc/server/deps';
import { handleInbound } from '@/lib/lc/server/inbound';
import { parseWebhook, verifySignature } from '@/lib/lc/server/whatsapp';

/**
 * Meta webhook for WhatsApp Cloud API.
 *
 * GET  — subscription verification (hub.mode / hub.verify_token / hub.challenge).
 * POST — inbound messages. One URL serves every organisation; the payload's
 *        phone_number_id picks the tenant. Always answers 200 quickly so Meta
 *        does not retry; failures are logged server-side.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return new Response('invalid signature', { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const inbound = parseWebhook(body);
  if (inbound.length === 0) return Response.json({ ok: true, ignored: true });
  const deps = supabaseInboundDeps();
  if (!deps) return Response.json({ ok: false, error: 'server not configured' }, { status: 200 });
  const results = [];
  for (const msg of inbound) {
    try {
      results.push(await handleInbound(msg, deps));
    } catch (e) {
      console.error('[lc/whatsapp] inbound failed', e);
      results.push(null);
    }
  }
  return Response.json({ ok: true, handled: results.filter(Boolean).length });
}
