import 'server-only';
import { readSecret } from '../server/db';
import { GraphError, graph } from '../server/graph';
import { logActivity } from '../server/log';
import type { ChannelAdapter, PublishInput, PublishResult } from './types';

/**
 * Facebook Page publishing through the official Pages API:
 *   text / link  → POST /{page}/feed
 *   one photo    → POST /{page}/photos (url + caption)
 *   many photos  → POST /{page}/photos (published=false) ×N, then /feed with attached_media
 *   video        → POST /{page}/videos (file_url + description)
 *
 * The CTA button is best effort: Meta only accepts call_to_action on link
 * posts, and the accepted set changes by API version. When Meta rejects it,
 * the post is retried once without the button and the activity log says so
 * — the phone number and WhatsApp link are already inside the text either way.
 */

function ctaPayload(input: PublishInput): string | undefined {
  if (!input.cta || !input.link) return undefined;
  let link = input.link;
  if (input.cta === 'WHATSAPP_MESSAGE' && input.whatsappUrl) link = input.whatsappUrl;
  if (input.cta === 'CALL_NOW' && input.phone) link = `tel:${input.phone.replace(/[^\d+]/g, '')}`;
  return JSON.stringify({ type: input.cta, value: { link } });
}

async function permalinkOf(token: string, postId: string): Promise<string | null> {
  try {
    const res = await graph<{ permalink_url?: string }>(postId, { token, params: { fields: 'permalink_url' } });
    return res.permalink_url ?? null;
  } catch {
    return `https://www.facebook.com/${postId}`;
  }
}

export const facebookPageChannel: ChannelAdapter = {
  channel: 'facebook_page',
  label: 'דף פייסבוק',
  apiPublishing: true,

  async publish(input): Promise<PublishResult> {
    const { target } = input;
    const token = await readSecret('target', target.id);
    if (!token) throw new GraphError('לא נמצא טוקן לדף — יש לסנכרן את היעדים מחדש.', 'auth', null, null);

    const pageId = target.external_id;
    const images = input.media.filter((m) => m.kind === 'image');
    const video = input.media.find((m) => m.kind === 'video');

    // Video (one per post — Meta's own composer has the same rule).
    if (video) {
      const res = await graph<{ id: string }>(`${pageId}/videos`, {
        token,
        method: 'POST',
        params: { file_url: video.url, description: input.text },
      });
      return { mode: 'api', externalPostId: res.id, permalink: `https://www.facebook.com/${pageId}/videos/${res.id}` };
    }

    // Single photo with caption.
    if (images.length === 1) {
      const res = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, {
        token,
        method: 'POST',
        params: { url: images[0].url, message: input.text },
      });
      const postId = res.post_id ?? res.id;
      return { mode: 'api', externalPostId: postId, permalink: await permalinkOf(token, postId) };
    }

    // Multi-photo: upload unpublished, then attach to one feed post.
    const params: Record<string, string | boolean | undefined> = { message: input.text };
    if (images.length > 1) {
      const ids: string[] = [];
      for (const img of images) {
        const res = await graph<{ id: string }>(`${pageId}/photos`, {
          token,
          method: 'POST',
          params: { url: img.url, published: false },
        });
        ids.push(res.id);
      }
      ids.forEach((id, i) => {
        params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
      });
    } else if (input.link) {
      params.link = input.link;
    }

    const cta = ctaPayload(input);
    if (cta && images.length === 0) params.call_to_action = cta;

    let notes: string | undefined;
    let res: { id: string };
    try {
      res = await graph<{ id: string }>(`${pageId}/feed`, { token, method: 'POST', params });
    } catch (err) {
      if (err instanceof GraphError && err.kind === 'invalid' && params.call_to_action) {
        // Retry without the CTA button — everything else stays identical.
        delete params.call_to_action;
        res = await graph<{ id: string }>(`${pageId}/feed`, { token, method: 'POST', params });
        notes = 'Meta לא קיבלה את כפתור ה-CTA לפוסט הזה — פורסם בלי הכפתור (הטלפון וה-WhatsApp נמצאים בטקסט).';
        await logActivity('warn', 'cta_dropped', notes, { target: target.name, code: err.code });
      } else {
        throw err;
      }
    }
    return { mode: 'api', externalPostId: res.id, permalink: await permalinkOf(token, res.id), notes };
  },
};
