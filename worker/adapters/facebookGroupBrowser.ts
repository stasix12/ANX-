import type { Page } from 'playwright-core';
import type { MediaItem, SocialTarget } from '@/lib/social/types';
import { publishToGroup, type ComposeResult, type ComposerStep } from '../facebook/composer';
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
  onStep: (step: ComposerStep) => Promise<void>;
  /** Present when the run must pause before the final click. */
  confirm?: (page: Page) => Promise<'confirmed' | 'cancelled' | 'timeout'>;
  /** Lets the caller grab a screenshot of the live page when something fails. */
  onPage?: (page: Page) => void;
}

export class FacebookGroupBrowserAdapter {
  readonly channel = 'facebook_group' as const;
  readonly label = 'קבוצת פייסבוק (דפדפן)';

  constructor(private session: BrowserSession) {}

  async publish(input: GroupPublishInput): Promise<ComposeResult> {
    let local: LocalMedia | null = null;
    const page = await this.session.newPage(input.headless);
    input.onPage?.(page);
    try {
      local = input.media.length ? await downloadMedia(input.queueId, input.media) : null;
      return await publishToGroup(page, {
        groupUrl: input.target.url,
        text: input.text,
        images: local?.images ?? [],
        video: local?.video ?? null,
        onStep: input.onStep,
        confirm: input.confirm,
      });
    } finally {
      cleanupMedia(local);
      // Keep the page open in debug mode for a few seconds so the owner sees the result.
      if (!input.headless) await page.waitForTimeout(4000).catch(() => undefined);
      await page.close().catch(() => undefined);
    }
  }
}
