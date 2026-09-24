import type { Page } from 'playwright-core';
import { parseGroupUrl, type MediaItem, type SocialTarget } from '@/lib/social/types';
import { PublishError, publishToGroup, type ComposeResult, type ComposerStep } from '../facebook/composer';
import type { BrowserSession } from '../facebook/session';
import { cleanupMedia, downloadMedia, type LocalMedia } from '../media';

/**
 * FacebookGroupBrowserAdapter — the Groups counterpart of the server-side
 * FacebookPage adapter. Same idea (one target + one rendered post in,
 * one result out) but it drives the owner's own logged-in browser because
 * Meta offers no API for groups.
 *
 * It receives the group URL, the final text, the media list and the
 * campaign/variant ids (for logging), reports each step through onStep,
 * and returns the composer's verdict. Nothing here touches the queue —
 * social-worker.ts owns persistence.
 */

export interface GroupPublishInput {
  queueId: string;
  target: SocialTarget;
  text: string;
  media: MediaItem[];
  campaignId: string | null;
  variantId: string | null;
  headless: boolean;
  /** Left as the first comment on the published post, or empty for none. */
  firstComment?: string;
  onStep: (step: ComposerStep) => Promise<void>;
  /** Present when the run must pause before the final click. */
  confirm?: (page: Page) => Promise<'confirmed' | 'cancelled' | 'timeout'>;
  /** Lets the caller grab a screenshot of the live page when something fails. */
  onPage?: (page: Page) => void;
  /** Called with the still-open page when the run throws, before it is closed. */
  onError?: (page: Page, error: unknown) => Promise<void>;
}

export class FacebookGroupBrowserAdapter {
  readonly channel = 'facebook_group' as const;
  readonly label = 'קבוצת פייסבוק (דפדפן)';

  constructor(private session: BrowserSession) {}

  async publish(input: GroupPublishInput): Promise<ComposeResult> {
    /*
     * The address is re-parsed here, never trusted, because THIS is where it
     * crosses from the database into a real browser holding the owner's live
     * Facebook session.
     *
     * parseGroupUrl guards the screen that adds a group, but nothing guarded
     * this: social_targets.url is a column, and under the single shared RLS
     * policy (supabase/social-schema.sql — every policy is `using (true)`) any
     * authenticated session can write it over PostgREST with no screen
     * involved. A row pointed at file:///…/.env.local, or at any page at all,
     * was opened by that browser — and if the job then failed, the failure
     * path screenshots whatever it landed on and uploads it to storage.
     *
     * parseGroupUrl only ever returns https://www.facebook.com/groups/<id>, so
     * the round trip is both the check and the normalisation.
     */
    const group = parseGroupUrl(input.target.url);
    if (!group) {
      throw new PublishError('cannot_post', `הכתובת של "${input.target.name}" אינה כתובת של קבוצת פייסבוק. תקנו אותה במסך הקבוצות.`);
    }
    let local: LocalMedia | null = null;
    const page = await this.session.newPage(input.headless);
    input.onPage?.(page);
    try {
      local = input.media.length ? await downloadMedia(input.queueId, input.media) : null;
      return await publishToGroup(page, {
        groupUrl: group.url,
        text: input.text,
        images: local?.images ?? [],
        video: local?.video ?? null,
        onStep: input.onStep,
        confirm: input.confirm,
        firstComment: input.firstComment,
      });
    } catch (err) {
      // Screenshot while the page still shows what went wrong.
      await input.onError?.(page, err).catch(() => undefined);
      throw err;
    } finally {
      cleanupMedia(local);
      // Keep the page open in debug mode for a few seconds so the owner sees the result.
      if (!input.headless) await page.waitForTimeout(4000).catch(() => undefined);
      await page.close().catch(() => undefined);
    }
  }
}
