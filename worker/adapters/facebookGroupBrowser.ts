import type { Page } from 'playwright-core';
import { parseGroupUrl, type MediaItem, type SocialTarget } from '@/lib/social/types';
import { PublishError, publishToGroup, type ComposeResult, type ComposerStep } from '../facebook/composer';
import type { BrowserSession } from '../facebook/session';
import { downloadMedia, type LocalMedia } from '../media';

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
  /** The earliest instant the post may be SUBMITTED. Passed straight through. */
  notBefore?: string | null;
  /** Called every few seconds while the post is held for `notBefore`. */
  onHold?: () => Promise<void>;
  /** Our own Facebook user id, so the composer can verify on our posts page. */
  authorId?: string;
  /**
   * How long this whole publication may occupy the browser, in milliseconds.
   *
   * Passed straight through to the composer, which is where it is spent and
   * where the long note on what it can and cannot bound lives. Absent means
   * unbounded — the behaviour this adapter had before it existed.
   */
  budgetMs?: number;
  onStep: (step: ComposerStep) => Promise<void>;
  /** Present when the run must pause before the final click. */
  confirm?: (page: Page) => Promise<'confirmed' | 'declined' | 'timeout' | 'stopped'>;
  /** Lets the caller grab a screenshot of the live page when something fails. */
  onPage?: (page: Page) => void;
  /** Called with the still-open page when the run throws, before it is closed. */
  onError?: (page: Page, error: unknown) => Promise<void>;
}

/** See the note at its one use below. */
const DEBUG_LINGER_MS = 1_500;

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
    const startedAt = Date.now();
    const group = parseGroupUrl(input.target.url);
    if (!group) {
      throw new PublishError('cannot_post', `הכתובת של "${input.target.name}" אינה כתובת של קבוצת פייסבוק. תקנו אותה במסך הקבוצות.`);
    }
    let local: LocalMedia | null = null;
    const page = await this.session.newPage(input.headless, 'פרסום לקבוצה');
    input.onPage?.(page);
    try {
      /* Shared across the whole round — see worker/media.ts. It is NOT deleted
         in the finally below: these files belong to the three hundred groups
         still queued behind this one, and deleting them per publication is the
         bug that took the project off the air. */
      local = input.media.length ? await downloadMedia(input.media) : null;
      return await publishToGroup(page, {
        groupUrl: group.url,
        text: input.text,
        images: local?.images ?? [],
        video: local?.video ?? null,
        onStep: input.onStep,
        confirm: input.confirm,
        notBefore: input.notBefore ?? null,
        onHold: input.onHold,
        authorId: input.authorId ?? '',
        budgetMs: input.budgetMs,
      });
    } catch (err) {
      // Screenshot while the page still shows what went wrong.
      await input.onError?.(page, err).catch(() => undefined);
      throw err;
    } finally {
      /*
       * A BEAT IN DEBUG MODE SO THE OWNER SEES THE RESULT — and it used to be
       * four seconds.
       *
       * Four seconds of doing nothing, on every publication, with the post
       * already up and the page about to close. On a queue set to thirty
       * seconds between posts that is an eighth of the whole interval spent
       * looking at a tab, and the owner runs headed (debugMode defaults on) —
       * so it was being paid every time, not only while debugging.
       *
       * A second and a half is still long enough to register what the page
       * ended on, which is all this wait was ever for. It is also skipped
       * entirely when the budget is already spent: a publication that ran long
       * must not then stand still.
       */
      if (!input.headless) {
        const spent = Number.isFinite(input.budgetMs) && Date.now() - startedAt >= (input.budgetMs as number);
        if (!spent) await page.waitForTimeout(DEBUG_LINGER_MS).catch(() => undefined);
      }
      await page.close().catch(() => undefined);
    }
  }
}
