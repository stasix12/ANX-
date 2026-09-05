import crypto from 'node:crypto';
import { generateReply, type InboundMessage } from '@/lib/whatsapp/bot';
import { downloadImage, markReadWithTyping, sendText } from '@/lib/whatsapp/waClient';
import { getOrCreateConversation, recordInbound, recordOutbound } from '@/lib/whatsapp/store';

/**
 * WhatsApp Business Cloud API webhook.
 *
 * GET  — Meta's one-time verification handshake (hub.challenge echo).
 * POST — message delivery. Every request is HMAC-verified against the Meta
 *        app secret, de-duplicated by wamid, answered by the Claude bot and
 *        logged to Supabase.
 *
 * Note: this route needs a server runtime — it is not part of the static
 * export (EXPORT=1) that feeds GitHub Pages.
 */

// The Claude tool loop (availability check → booking) can take a while;
// don't let a short serverless default cut a reply off mid-conversation.
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

/** Constant-time check of X-Hub-Signature-256 against the app secret. */
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Without the secret configured we can't authenticate Meta — refuse
    // rather than accept forged webhooks that would text real customers.
    console.error('WhatsApp webhook: WHATSAPP_APP_SECRET is not set');
    return false;
  }
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const received = header.slice('sha256='.length);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Transcript line for the message — cheap, no media download. */
function toLogBody(message: any): string {
  switch (message.type) {
    case 'text':
      return String(message.text?.body ?? '');
    case 'image': {
      const caption = String(message.image?.caption ?? '');
      return caption ? `[תמונה] ${caption}` : '[תמונה]';
    }
    default:
      return `[${String(message.type)}]`;
  }
}

/** The message shapes we answer; everything else gets a graceful fallback. */
async function toInbound(message: any): Promise<InboundMessage> {
  const wamid = String(message.id ?? '');
  switch (message.type) {
    case 'text':
      return { wamid, text: String(message.text?.body ?? '') };
    case 'image': {
      const caption = String(message.image?.caption ?? '');
      const media = message.image?.id ? await downloadImage(String(message.image.id)) : null;
      return {
        wamid,
        text: caption || 'הלקוח שלח תמונה.',
        ...(media ? { image: media } : {}),
      };
    }
    case 'audio':
    case 'video':
    case 'document':
    case 'sticker':
    case 'location':
    case 'contacts':
      return {
        wamid,
        text: `הלקוח שלח הודעה מסוג ${message.type} שאינך יכול לפתוח. בקש ממנו בעדינות לכתוב טקסט או לשלוח תמונה.`,
      };
    default:
      return {
        wamid,
        text: 'הלקוח שלח הודעה בפורמט שאינך יכול לקרוא. בקש טקסט או תמונה.',
      };
  }
}

async function handleMessage(message: any, contacts: any[]): Promise<void> {
  const waId = String(message.from ?? '');
  const wamid = String(message.id ?? '');
  if (!waId || !wamid) return;

  const profileName = String(
    contacts?.find((c) => c?.wa_id === waId)?.profile?.name ?? '',
  );

  const conversation = await getOrCreateConversation(waId, profileName);

  // Meta redelivers webhooks; the unique wamid makes the second delivery a
  // no-op — checked before any media download or model call.
  const isNew = await recordInbound(conversation.id, wamid, toLogBody(message));
  if (!isNew) return;

  const inbound = await toInbound(message);

  await markReadWithTyping(wamid);

  const reply = await generateReply(conversation, inbound);
  if (!reply) return; // human takeover — the bot stays silent

  const outboundId = await sendText(waId, reply);
  await recordOutbound(conversation.id, outboundId, reply);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Always 200 once the signature checks out — Meta retries non-2xx
  // deliveries, and a retry storm on a failing conversation helps no one.
  // Failures are logged and the customer can simply write again.
  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        if (change?.field !== 'messages') continue;
        const value = change.value ?? {};
        for (const message of value.messages ?? []) {
          try {
            await handleMessage(message, value.contacts ?? []);
          } catch (error) {
            console.error('WhatsApp bot: failed to handle message', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('WhatsApp bot: webhook processing error', error);
  }

  return Response.json({ status: 'ok' });
}
