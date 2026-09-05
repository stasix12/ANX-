/**
 * Thin client for the WhatsApp Business Cloud API (Meta Graph API).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const GRAPH_BASE = 'https://graph.facebook.com/v23.0';

function accessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('WhatsApp bot: חסר WHATSAPP_ACCESS_TOKEN.');
  return token;
}

function phoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error('WhatsApp bot: חסר WHATSAPP_PHONE_NUMBER_ID.');
  return id;
}

async function graphPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Sends a plain text message; returns the outbound wamid when Meta provides one. */
export async function sendText(to: string, text: string): Promise<string | null> {
  const json = await graphPost(`${phoneNumberId()}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  });
  const messages = json.messages as { id?: string }[] | undefined;
  return messages?.[0]?.id ?? null;
}

/**
 * Marks the customer's message as read and shows a typing indicator while
 * Claude thinks — the small touches that make the chat feel attended.
 * Best-effort: a failure here must never kill the actual reply.
 */
export async function markReadWithTyping(messageId: string): Promise<void> {
  try {
    await graphPost(`${phoneNumberId()}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    });
  } catch {
    // Ignore — read receipts are cosmetic.
  }
}

export interface DownloadedMedia {
  base64: string;
  mimeType: string;
}

/** Media types Claude's vision accepts. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * Resolves a media id to its (short-lived) CDN URL and downloads the bytes.
 * Returns null for types Claude can't look at.
 */
export async function downloadImage(mediaId: string): Promise<DownloadedMedia | null> {
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!metaRes.ok) throw new Error(`WhatsApp media lookup failed: ${metaRes.status}`);
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url || !meta.mime_type || !IMAGE_TYPES.has(meta.mime_type)) return null;

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!fileRes.ok) throw new Error(`WhatsApp media download failed: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { base64: buffer.toString('base64'), mimeType: meta.mime_type };
}
