import { getStore, nowIso, uid } from './store';

/**
 * Notification service. Every user-facing "something happened" goes through
 * sendNotification(), which fans out to whichever channels are wired:
 *
 *  - inapp: always — a row in the notifications collection, rendered by the
 *    bell in each shell and delivered live over the store's change feed.
 *  - webpush: browser push through the /market service worker once the app
 *    asks for permission (see MarketShell) — real push delivery needs VAPID
 *    keys (WEB_PUSH_VAPID_PUBLIC/PRIVATE in .env.local) and a small server
 *    endpoint; the SW handler is already in place (public/market/sw.js).
 *  - sms / email / whatsapp: implement Channel for the provider and add it to
 *    the channels list. WhatsApp Business API keys would go server-side:
 *    WHATSAPP_TOKEN / WHATSAPP_PHONE_ID.
 */

export interface Channel {
  id: string;
  deliver(userId: string, title: string, body: string, bookingId: string | null): Promise<void>;
}

const InAppChannel: Channel = {
  id: 'inapp',
  async deliver(userId, title, body, bookingId) {
    await getStore().put('notifications', {
      id: uid(),
      userId,
      title,
      body,
      bookingId,
      read: false,
      createdAt: nowIso(),
    });
  },
};

/** Browser notification for the local tab — a stand-in until real push ships. */
const LocalPushChannel: Channel = {
  id: 'webpush',
  async deliver(_userId, title, body) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      try {
        new Notification(title, { body, icon: '/crm/icon-192.png' });
      } catch {
        // Some mobile browsers only allow SW-originated notifications; fine.
      }
    }
  },
};

const channels: Channel[] = [InAppChannel, LocalPushChannel];

export async function sendNotification(
  userId: string,
  title: string,
  body: string,
  bookingId: string | null = null,
): Promise<void> {
  await Promise.all(channels.map((c) => c.deliver(userId, title, body, bookingId).catch(() => {})));
}
