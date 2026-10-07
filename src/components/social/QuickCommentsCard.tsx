'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listRecentPosts } from '@/lib/social/client';
import type { Campaign, MediaItem, Post } from '@/lib/social/types';
import type { CampaignState } from '@/lib/social/campaign';
import { ChevronDownIcon, MessageIcon, PlusIcon } from '@/components/icons';
import { PostCover } from './PostCover';
import { Card, OverflowMenu } from './ui';

/**
 * "25.09 · 14:20" — the day and the hour, on one line.
 *
 * <Stamp> is the app's timestamp and is used everywhere else, but it writes
 * "25.09.2026, 14:20", which at this card's 96px wraps onto two lines and
 * turns a tidy strip into a ragged one. The year is the part carrying least
 * here: this strip only ever shows runs from the last few weeks, and which
 * year they were in is never the question.
 *
 * dir="ltr" IS NOT DECORATION, and it is the whole reason this is a component
 * rather than a template string at the call site. The text is two European
 * number runs around neutral separators; inside an RTL card the bidi
 * algorithm resolves those separators to R and renders it as "14:20 · 09.25"
 * — the time in front of the date. `dir="auto"` does not help, because the
 * string has no strong character and auto then falls back to the parent's
 * RTL. An explicit LTR island is the same fix DateTime.tsx documents at
 * length for the full stamp.
 */
function ShortStamp({ iso }: { iso: string | null }) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    <span dir="ltr" className="inline-block tabular-nums">
      {`${two(d.getDate())}.${two(d.getMonth() + 1)} · ${two(d.getHours())}:${two(d.getMinutes())}`}
    </span>
  );
}

/**
 * "תגובות מהירות" — the recent runs, and one tap to put a comment under them.
 *
 * WHAT IT IS FOR. Adding a comment is the owner's main follow-up move: the
 * post carries the offer, the comment carries the price list or the phone
 * number. Until now that lived two screens away — קמפיינים, open the round,
 * find the control — so the thing they do most often was the thing that took
 * the most taps. This puts the last few runs on the home screen with the
 * comment control attached to each one.
 *
 * WHAT IT SHOWS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * Only figures this app actually holds. Each card carries its cover, its
 * name, when it last published and how many groups it reached — every one of
 * those read from the same rows the dashboard already loaded.
 *
 * It does NOT show views, reactions or likes. Those were collected by
 * reopening every published post's group and scrolling to find it, which came
 * to hundreds of Facebook page loads a day, and the owner switched it off:
 * "לא צריך לבדוק צפיות .. גם ככה לא רואים את זה בפייסבוק". Drawing the row
 * anyway would mean either a dash under every card or a number frozen at
 * whenever collection stopped — an invented figure is exactly what this
 * product does not do.
 *
 * IT REMOVES ITSELF when nothing has been published, the same rule
 * StartFromLibrary and CommentQueueCard follow: a card offering to comment on
 * publications that do not exist is furniture on a fresh install.
 */
export function QuickCommentsCard({
  campaigns,
  states,
  onComment,
}: {
  campaigns: Campaign[];
  states: Record<string, CampaignState>;
  /** Opens the app's existing comment sheet for this round. */
  onComment: (campaign: Campaign) => void;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    let alive = true;
    listRecentPosts()
      .then((p) => {
        if (alive) setPosts(p);
      })
      /* A cover that will not load is a thumbnail that is missing, not an
         error worth a red banner over a card whose other four fields are
         fine. */
      .catch(() => {
        if (alive) setPosts([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  /*
   * THE LAST SIX RUNS THAT ACTUALLY PUBLISHED SOMETHING, newest first.
   *
   * Ordered by the most recent publication rather than by when the round was
   * created: a round set up last week and started this morning is the one the
   * owner wants to comment on, and created_at would bury it.
   *
   * `published > 0` is the filter that makes the card mean what its button
   * says. A comment lands on posts that went out; a round still waiting in
   * the queue has nothing under which to put one, and offering it would be a
   * button that reports "0 פרסומים" when tapped.
   */
  const recent = useMemo(() => {
    const withLast = campaigns
      .filter((c) => c.status !== 'archived')
      .map((c) => {
        const s = states[c.id];
        /*
         * everPublished / lastPublishedAt, NOT progress.published and `done`.
         *
         * Those two are scoped to today for a repeating round — which is what
         * the counter on the campaign card wants and the exact opposite of what
         * this strip wants. Reading them here meant that from midnight until
         * the day's first publication every repeating round counted as having
         * published nothing, `recent` came back empty, and the whole card
         * returned null: "לאן נעלם המשבצת של התגובות מהירות?"
         */
        return {
          campaign: c,
          published: s?.everPublished ?? 0,
          lastAt: s?.lastPublishedAt ?? null,
          channel: s?.lastPublishedChannel ?? null,
        };
      })
      .filter((x) => x.published > 0 && x.lastAt);
    withLast.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    return withLast.slice(0, 6);
  }, [campaigns, states]);

  /* One pass over the posts, not a find() per card: the library read is
     bounded at twelve but the shape should not depend on that staying true. */
  const coverOf = useMemo(() => {
    const byCampaign = new Map<string, MediaItem[]>();
    for (const p of posts ?? []) {
      if (!p.campaign_id || !p.media?.length) continue;
      if (!byCampaign.has(p.campaign_id)) byCampaign.set(p.campaign_id, p.media);
    }
    return byCampaign;
  }, [posts]);

  if (!recent.length) return null;

  const newest = recent[0].campaign;

  return (
    <Card
      title={
        /* min-w-0 + truncate on the TEXT, not just on the Card's <h2>: the
           heading truncates its child, and a flex child without min-w-0
           refuses to shrink below its content — so at 360px the words ran out
           of the box instead of ellipsing. Measured, not guessed. */
        <span className="flex min-w-0 items-center gap-2">
          <MessageIcon aria-hidden className="h-4 w-4 shrink-0 text-brand-500" />
          <span className="truncate">תגובות מהירות</span>
        </span>
      }
      subtitle="הפרסומים האחרונים שלי"
      action={
        <Link
          href="/social/campaigns"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-500/10 px-3 text-sm font-bold text-brand-400 transition-colors hover:bg-brand-500/20"
        >
          {/*
            "כל הפרסומים", not "צפייה בכל הפרסומים". The longer wording was
            asked for and does not fit: measured at 360px it left the title
            105px of a 129px word and pushed "תגובות מהירות" out of its own
            box. This is also the phrasing the app already uses for exactly
            this control — "כל הספרייה" above the post picker — so the short
            form is the house style rather than a compromise.
          */}
          כל הפרסומים
          {/* The chevron is the one in the set, turned to point the way an RTL
              "onwards" points. A new glyph for one arrow would be the first
              thing here that did not come from the app. */}
          <ChevronDownIcon aria-hidden className="h-3.5 w-3.5 rotate-90" />
        </Link>
      }
    >
      {/*
       * A horizontal strip, not a grid. Six covers stacked would push the
       * bottom navigation off a phone, and the ask was explicit: three or four
       * in view and the rest a swipe away. snap-x so a thumb lands on a whole
       * card instead of between two; -mx-1/px-1 gives the first and last
       * card's focus ring room without the strip inheriting the card padding
       * as dead space at either end.
       */}
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [&>*]:min-w-0">
        {recent.map(({ campaign, published, lastAt, channel }) => (
          <li key={campaign.id} className="shrink-0 snap-start">
            {/*
             * The whole card is the tap target and it does one thing: open the
             * comment sheet for this round. `relative` so the ⋯ can sit in the
             * corner, and the menu stops its own clicks (OverflowMenu already
             * calls stopPropagation) so the corner is not a trap.
             */}
            {/*
               * 96px, MEASURED. The brief asked for "בערך 3–4 כרטיסים במבט
               * אחד" and against "כרטיסים גדולים שתופסים את כל המסך". At the
               * 152px this started as, exactly ONE card fitted inside the
               * strip at 360px — the shape the brief was written against. At
               * 96px it is three, with the fourth showing its edge, which is
               * also what tells a thumb there is more to the right.
               */}
              <div className="relative w-24 rounded-xl border border-ink-700 bg-ink-850 p-1.5">
              <button
                type="button"
                onClick={() => onComment(campaign)}
                aria-label={`הוסף תגובה לפרסום "${campaign.name}"`}
                className="block w-full rounded-lg text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                <span className="relative block">
                  {coverOf.get(campaign.id)?.length ? (
                    <PostCover media={coverOf.get(campaign.id)} className="h-16 w-full" />
                  ) : (
                    /*
                     * A RESERVED SLOT, never a collapsed one. A run whose post
                     * carries no picture is ordinary — plenty are text and a
                     * WhatsApp button — and letting the card shrink gave the
                     * strip a ragged top edge where a cover had simply not
                     * loaded yet.
                     */
                    <span className="grid h-16 w-full place-items-center rounded-lg bg-ink-800 text-mist-500">
                      <MessageIcon aria-hidden className="h-5 w-5" />
                    </span>
                  )}
                  {/* The channel, from the row that was actually published to
                      it — so the day this app posts anywhere else, the card
                      says so by itself. */}
                  {channel && (
                    <span className="absolute bottom-1 start-1 rounded-md bg-ink-850/90 px-1.5 py-0.5 text-[10px] font-bold text-mist-300">
                      {channel === 'instagram' ? 'Instagram' : 'פייסבוק'}
                    </span>
                  )}
                </span>
                <span dir="auto" className="mt-1.5 block truncate text-[13px] font-bold leading-tight text-mist-100">
                  {campaign.name}
                </span>
                <span className="mt-1 block truncate text-[11px] leading-4 text-mist-500">
                  <ShortStamp iso={lastAt} />
                </span>
                {/*
                 * The one figure this app can still stand behind. "N קבוצות"
                 * is a count of rows that published, held in the same state
                 * object the rest of this screen is drawn from — not a number
                 * fetched from Facebook, so it cannot go stale or be missing.
                 */}
                <span className="mt-0.5 block text-[11px] font-bold leading-4 text-brand-400">
                  {published} {published === 1 ? 'קבוצה' : 'קבוצות'}
                </span>
              </button>
              <OverflowMenu
                label={`פעולות לפרסום "${campaign.name}"`}
                className="absolute end-1 top-1"
                actions={[
                  { label: 'הוסף תגובה', icon: <MessageIcon aria-hidden className="h-4 w-4" />, onSelect: () => onComment(campaign) },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>

      {/*
       * THE BUTTON IS THE NEWEST RUN'S, and it says so rather than leaving the
       * owner to guess which of six it means. Written as its own control and
       * not the shared <Button>, because this one is a full-width dashed-free
       * outline in the accent — the "add another" shape the app uses for
       * adding a row, not the shape of a primary action.
       */}
      <button
        type="button"
        onClick={() => onComment(newest)}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/5 px-4 text-sm font-extrabold text-brand-400 transition-colors hover:bg-brand-500/15 active:bg-brand-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <PlusIcon aria-hidden className="h-4 w-4" />
        הוסף תגובה מהירה
      </button>
      <p dir="auto" className="mt-1.5 truncate text-center text-[11px] text-mist-500">
        לפרסום האחרון: {newest.name}
      </p>
    </Card>
  );
}
