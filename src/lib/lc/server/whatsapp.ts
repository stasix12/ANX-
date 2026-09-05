import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Attachment, Integration } from '../types';

/**
 * WhatsApp Cloud API (Meta Graph API) — the real messaging adapter.
 *
 * One Meta app + one webhook URL serve every organisation: each inbound event
 * carries the `phone_number_id` it was sent to, and that id is what a business
 * registers in Settings → Integrations. Outbound messages use the business's
 * own permanent access token. All of this runs server-side only.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface WaConfig {
  phoneNumberId: string;
  accessToken: string;
}

export function waConfigOf(integration: Integration | undefined | null): WaConfig | null {
  const c = integration?.config;
  if (!c?.phoneNumberId || !c.accessToken) return null;
  return { phoneNumberId: c.phoneNumberId, accessToken: c.accessToken };
}

/** 05X-XXXXXXX → 9725XXXXXXXX (WhatsApp wants E.164 digits without '+'). */
export function toWaId(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/** 9725XXXXXXXX → 05XXXXXXXX (how the app stores Israeli numbers). */
export function fromWaId(waId: string): string {
  const digits = waId.replace(/\D/g, '');
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
}

async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) throw new Error(body.error?.message ?? `Graph API ${res.status}`);
  return body;
}

export async function sendText(cfg: WaConfig, to: string, text: string): Promise<{ id: string }> {
  const r = await graph<{ messages?: { id: string }[] }>(`${cfg.phoneNumberId}/messages`, cfg.accessToken, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: toWaId(to), type: 'text', text: { preview_url: false, body: text } }),
  });
  return { id: r.messages?.[0]?.id ?? '' };
}

/**
 * Business-initiated message outside the 24h window must be an approved
 * template. We pass the rendered message as the single body parameter, so
 * the template should be written as "{{1}}" (or a fixed text that ignores it).
 */
export async function sendTemplate(cfg: WaConfig, to: string, template: string, language: string, bodyText: string): Promise<{ id: string }> {
  const r = await graph<{ messages?: { id: string }[] }>(`${cfg.phoneNumberId}/messages`, cfg.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toWaId(to),
      type: 'template',
      template: { name: template, language: { code: language === 'he' ? 'he' : language === 'ru' ? 'ru' : 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: bodyText.slice(0, 1024) }] }] },
    }),
  });
  return { id: r.messages?.[0]?.id ?? '' };
}

export async function markRead(cfg: WaConfig, messageId: string): Promise<void> {
  await graph(`${cfg.phoneNumberId}/messages`, cfg.accessToken, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }) }).catch(() => undefined);
}

export async function phoneInfo(cfg: WaConfig): Promise<{ displayPhone: string; verifiedName: string; qualityRating: string }> {
  const r = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(`${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, cfg.accessToken);
  return { displayPhone: r.display_phone_number ?? '', verifiedName: r.verified_name ?? '', qualityRating: r.quality_rating ?? '' };
}

/** Resolves a media id to its bytes (the URL Meta returns is short-lived and needs the token). */
export async function downloadMedia(cfg: WaConfig, mediaId: string): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  try {
    const meta = await graph<{ url?: string; mime_type?: string }>(`${mediaId}`, cfg.accessToken);
    if (!meta.url) return null;
    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
    if (!res.ok) return null;
    return { bytes: await res.arrayBuffer(), mimeType: meta.mime_type ?? res.headers.get('content-type') ?? 'image/jpeg' };
  } catch {
    return null;
  }
}

/** Validates X-Hub-Signature-256 when WHATSAPP_APP_SECRET is configured. */
export function verifySignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret) return true; // not configured → skip (documented in SETUP.md)
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
}

// ───────────────────────────── Webhook payload parsing ─────────────────────────────

export interface InboundWa {
  phoneNumberId: string;
  messageId: string;
  from: string; // wa_id
  name: string;
  timestamp: string; // ISO
  text: string;
  media: { id: string; mimeType: string; caption?: string }[];
  type: string;
}

interface WebhookBody {
  object?: string;
  entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: { id: string; from: string; timestamp: string; type: string; text?: { body?: string }; image?: { id: string; mime_type?: string; caption?: string }; video?: { id: string; mime_type?: string; caption?: string }; document?: { id: string; mime_type?: string; caption?: string }; audio?: { id: string; mime_type?: string }; location?: { latitude: number; longitude: number; name?: string; address?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[] } }[] }[];
}

export function parseWebhook(body: unknown): InboundWa[] {
  const out: InboundWa[] = [];
  const b = body as WebhookBody;
  if (b?.object !== 'whatsapp_business_account') return out;
  for (const entry of b.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages?.length || !v.metadata?.phone_number_id) continue;
      for (const m of v.messages) {
        const contact = v.contacts?.find((c) => c.wa_id === m.from) ?? v.contacts?.[0];
        const media: InboundWa['media'] = [];
        let text = m.text?.body ?? '';
        if (m.image) media.push({ id: m.image.id, mimeType: m.image.mime_type ?? 'image/jpeg', caption: m.image.caption });
        if (m.video) media.push({ id: m.video.id, mimeType: m.video.mime_type ?? 'video/mp4', caption: m.video.caption });
        if (m.document) media.push({ id: m.document.id, mimeType: m.document.mime_type ?? 'application/octet-stream', caption: m.document.caption });
        if (m.image?.caption || m.video?.caption || m.document?.caption) text = text || (m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? '');
        if (m.location) text = text || `${m.location.name ?? ''} ${m.location.address ?? ''}`.trim() || `${m.location.latitude},${m.location.longitude}`;
        if (m.button?.text) text = text || m.button.text;
        if (m.interactive) text = text || m.interactive.button_reply?.title || m.interactive.list_reply?.title || '';
        out.push({ phoneNumberId: v.metadata.phone_number_id, messageId: m.id, from: m.from, name: contact?.profile?.name ?? '', timestamp: new Date(Number(m.timestamp) * 1000).toISOString(), text, media, type: m.type });
      }
    }
  }
  return out;
}

export type { Attachment };
