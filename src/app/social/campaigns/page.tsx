'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CampaignCard } from '@/components/social/CampaignCard';
import { QueueTunerSheet } from '@/components/social/QueueTunerSheet';
import { CampaignCommentSheet } from '@/components/social/CampaignCommentSheet';
import { SocialShell } from '@/components/social/SocialShell';
import {
  Button,
  Card,
  ButtonLink,
  EmptyState,
  ErrorState,
  SegmentedControl,
  SkeletonList,
  useConfirm,
  useToast,
} from '@/components/social/ui';
import {
  campaignStates,
  deleteCampaign,
  duplicateCampaign,
  getControl,
  listCampaigns,
  listCampaignPosts,
  type CampaignPostSummary,
  listWorkers,
  pauseCampaign,
  queueCampaignComment,
  reopenCampaign,
  getBrowserSettings,
  getLimits,
  lastPublishedAt,
  matchAccountGapTo,
  saveCampaign,
  rescheduleCampaignQueue,
  setCampaignRepeat,
  repeatRefusedText,
  syncWeeklyHours,
  stopCampaign,} from '@/lib/social/client';
import { campaignState, cancellableRows, type CampaignState } from '@/lib/social/campaign';
import { SNAPSHOT, readSnapshot, writeSnapshot } from '@/lib/social/snapshot';
import { MIN_REPEAT_HOURS, readRepeat, readSchedule, repeatColumns, repeatFloorFrom, scheduleColumns, type CampaignRepeat, type CampaignSchedule, readRounds, roundsColumn, roundsSavedMessage, type CampaignRound,} from '@/lib/social/campaign-schedule';
import { accountGapLabel } from '@/lib/social/rules';
import { counted } from '@/lib/social/time';
import { scheduleReadout, type AccountSpacing } from '@/lib/social/schedule-readout';
import type { Campaign, ControlSettings } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { MegaphoneIcon } from '@/components/icons';

type Filter = 'live' | 'all' | 'done';

/**
 * The campaign list: one card per campaign showing how far it has got and
 * what happens next, with the editor in a sheet rather than a permanent
 * column — on a phone the form used to take the whole first screen before
 * any campaign was visible.
 *
 * "Live" is the default filter, because a finished campaign is history and
 * belongs one tap away.
 */
/** Everything this screen draws, in one object, so it can be kept whole. */
interface CampaignsSnapshot {
  campaigns: Campaign[];
  posts: CampaignPostSummary[];
  states: Record<string, CampaignState>;
  control: ControlSettings | null;
  workerOnline: boolean | undefined;
}

export default function CampaignsPage() {
  /*
   * SEEDED FROM THE LAST TIME THIS SCREEN WAS OPEN, so coming back to it
   * paints immediately instead of shimmering through five reads it already
   * made a minute ago. See src/lib/social/snapshot.ts: nothing here is read
   * INSTEAD of the database — load() runs below exactly as it did, on mount,
   * and replaces all of this the moment it lands.
   *
   * In the initialiser and nowhere else: the snapshot is module state, and
   * reading it during a later render would let two renders of this component
   * disagree about what is on screen.
   */
  const seed = useState(() => readSnapshot<CampaignsSnapshot>(SNAPSHOT.campaigns))[0];
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(seed?.campaigns ?? null);
  const [posts, setPosts] = useState<CampaignPostSummary[]>(seed?.posts ?? []);
  const [states, setStates] = useState<Record<string, CampaignState>>(seed?.states ?? {});
  /*
   * The two machine facts every run badge on this screen depends on, and this
   * page read neither. Without the control row the cards showed a green
   * pulsing "רץ" while the PublishingToggle in the header of the same viewport
   * was amber "מושהה"; without the heartbeat a run whose laptop had been
   * asleep since yesterday pulsed as if it were publishing right now.
   * runBadge() in campaign.ts decides what they mean — the cards only render it.
   */
  const [control, setControl] = useState<ControlSettings | null>(seed?.control ?? null);
  const [spacing, setSpacing] = useState<AccountSpacing | undefined>(undefined);
  /*
   * ─── THE ACCOUNT'S REPEAT FLOOR, WHICH THIS SCREEN DID NOT KNOW ──────────
   *
   * "שיניתי לפחות מ-12 שעות ועדין לא נותן לפרסם."
   *
   * Every floor-sensitive call here ran on the hard-coded twelve: the cards
   * judged his rounds against twelve, readRepeat() raised a stored two back to
   * twelve before drawing it, and setCampaignRepeat() wrote twelve over it. So
   * the number he set in Settings was honoured by the dashboard and silently
   * undone by the list one tap away — the same value, two screens, two
   * answers. getLimits() was ALREADY in this screen's load(); only its repeat
   * floor was being thrown away.
   *
   * MIN_REPEAT_HOURS until the first load answers, which is the protective
   * direction: a screen that does not yet know the account's number must not
   * act as though the protection were lower than it is.
   */
  const [floorHours, setFloorHours] = useState<number>(MIN_REPEAT_HOURS);
  const [workerOnline, setWorkerOnline] = useState<boolean | undefined>(seed?.workerOnline);
  /*
   * WHICH ROUND THE COMMENT SHEET IS ABOUT — and null when it is closed, so
   * one sheet serves every card instead of one mounted per row.
   */
  const [commentFor, setCommentFor] = useState<Campaign | null>(null);
  /*
   * WHICH ROUND THE QUEUE TUNER IS ABOUT — null when it is closed, so one
   * sheet serves every card, exactly as the dashboard does it.
   */
  const [tuner, setTuner] = useState<{ campaignId?: string } | null>(null);
  const [filter, setFilter] = useState<Filter>('live');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      /* getBusiness() used to be read here too — for the service and city
         lists in the editing sheet, and for nothing else. The sheet is gone,
         so the round trip went with it. */
      /*
       * listCampaignPosts() AND NOT listPosts().
       *
       * listPosts() is every non-archived post in the account with its
       * base_text and its media, unbounded — and this screen uses three
       * fields of it: which campaign a post belongs to, its cover, and its
       * id. An owner with two hundred drafts downloaded all of them, text
       * included, to draw twenty-five thumbnails. The campaign control centre
       * had exactly this bug and listPostsForCampaign() was written for it;
       * this is the list screen's version of the same fix.
       */
      const [c, p, st, ctrl, workers, lim, brw, lastPub] = await Promise.all([
        listCampaigns(),
        listCampaignPosts(),
        campaignStates(),
        getControl(),
        listWorkers(),
        /* THE OTHER HALF OF "הבא בתור" — rules.ts holds a row for the later of
           the campaign's own gap and an account-wide one, and this list knew
           only the first. Three cheap reads inside the round trip this screen
           already makes. */
        getLimits(),
        getBrowserSettings(),
        lastPublishedAt(),
      ]);
      setFloorHours(repeatFloorFrom(lim));
      setSpacing({
        minGapMinutes: lim.minGapMinutes,
        groupMinGapMinutes: brw.groupMinGapMinutes,
        /* And the seconds, which are the canonical pair once the account has
           them — a 30-second floor is not expressible in the minutes. */
        minGapSeconds: lim.minGapSeconds,
        groupMinGapSeconds: brw.groupMinGapSeconds,
        lastPublishedAt: lastPub,
      });
      const online = workers.some((w) => w.online);
      setCampaigns(c);
      setPosts(p);
      setStates(st);
      setControl(ctrl);
      setWorkerOnline(online);
      setError(null);
      /* Kept only when the whole read succeeded, so a half-failed load can
         never be what the next visit opens on. */
      writeSnapshot<CampaignsSnapshot>(SNAPSHOT.campaigns, { campaigns: c, posts: p, states: st, control: ctrl, workerOnline: online });
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, []);

  /*
   * ───────── AND IT RE-READS ITSELF, like the two screens either side of it ──
   *
   * "המערכת חייבת להציג נתונים מעודכנים, גם כאשר המשתמש אינו מרענן את הדף."
   *
   * This screen read ONCE, on mount. So after a publication, a failure, a skip
   * or a pause it kept the numbers it was born with, while the dashboard one
   * tap away refreshed every thirty seconds — the same round, two different
   * counts, and the only way to reconcile them was to leave the screen and
   * come back.
   *
   * SIXTY SECONDS, not the dashboard's thirty: this is a list of cards with no
   * countdown on it, and its read (listCampaigns + campaignStates, three
   * queries) is the heaviest thing on a metered Israeli mobile plan that is
   * not the dashboard itself.
   *
   * The three guards are the ones every other poller in this product uses and
   * are not optional: paused while the tab is hidden, re-read immediately on
   * return so what the owner sees when they come back is current, and an
   * in-flight flag so a slow connection cannot stack reads on top of each
   * other.
   */
  useEffect(() => {
    let alive = true;
    let running = false;
    const tick = async () => {
      if (!alive || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        await load();
      } finally {
        running = false;
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const stateOf = useCallback((c: Campaign): CampaignState => states[c.id] ?? campaignState([], c), [states]);

  const counts = useMemo(() => {
    const list = campaigns ?? [];
    const done = list.filter((c) => ['completed', 'stopped'].includes(stateOf(c).state)).length;
    return { all: list.length, done, live: list.length - done };
  }, [campaigns, stateOf]);

  /*
   * Sorted, not just filtered.
   *
   * listCampaigns() orders by created_at DESC and this list rendered them in
   * that order, so a run publishing RIGHT NOW could sit below a run that has
   * never started — and "פעילים" mixes רץ / מושהה / טרם התחיל / דורש טיפול
   * into one stack of identically-sized cards whose only live signal is a
   * badge in the corner of each. The run a worker is actually holding goes
   * first, then whatever goes out soonest. No new field: both come out of
   * `states`, which the page already has.
   */
  /* The one answer about time this list may use, for the ORDER as well as for
     the cards — the cards already call it through CampaignCard. */
  /*
   * ─── THE EDIT THE OWNER MADE, HELD OVER THE STORED ROW ───────────────────
   *
   * "שינויים בהגדרות לא מתעדכנים מיידית."
   *
   * This screen patched the edit straight into `campaigns`, and a read lands
   * on top of that list every five seconds. So between the tap and the write
   * settling — 600ms of debounce plus a campaign save, a repeat re-arm, a
   * floor write and a queue respace, which is several seconds on a phone — any
   * refresh put the STORED row back and the card snapped to the old hour, the
   * old days, the old gap. The owner taps a day chip, watches it light up, and
   * watches it go out again.
   *
   * Keyed by campaign id, because this screen shows every round at once: one
   * patch would mean setting A's hours, scrolling to B, tapping a chip, and
   * A's edit silently replaced.
   */
  const [schedulePatch, setSchedulePatch] = useState<Record<string, ReturnType<typeof scheduleColumns>>>({});
  /* What a card draws: the stored row, with the owner's un-acknowledged change
     laid over it. readSchedule() validates every field either way, so a row
     written by an older version still resolves to a usable schedule. */
  const scheduleOf = useCallback(
    (campaign: Campaign) => readSchedule(schedulePatch[campaign.id] ? { ...campaign, ...schedulePatch[campaign.id] } : campaign),
    [schedulePatch],
  );

  const readoutFor = useCallback(
    (c: Campaign) => scheduleReadout(scheduleOf(c), stateOf(c), new Date(), readRepeat(c, floorHours), spacing),
    [scheduleOf, stateOf, spacing, floorHours],
  );

  const visible = useMemo(() => {
    const list = campaigns ?? [];
    const finished = (c: Campaign) => ['completed', 'stopped'].includes(stateOf(c).state);
    const picked = filter === 'all' ? [...list] : filter === 'done' ? list.filter(finished) : list.filter((c) => !finished(c));
    return picked.sort((a, b) => {
      const sa = stateOf(a);
      const sb = stateOf(b);
      const live = Number(sb.progress.running > 0) - Number(sa.progress.running > 0);
      if (live) return live;
      /*
       * ORDERED BY THE INSTANT EACH CARD PRINTS, not by the stored column.
       *
       * `state.nextAt` is the raw `scheduled_at` of the soonest waiting row;
       * the card beside it prints scheduleReadout → projectOne, with the
       * window, the campaign gap and the account floor applied. So two rounds
       * could be ordered one way by their stamps and read the other way round
       * on screen — a list claiming to be "soonest first" contradicted by the
       * times printed on it.
       */
      const ra = readoutFor(a);
      const rb = readoutFor(b);
      const na = ra?.kind === 'due' ? ra.at : null;
      const nb = rb?.kind === 'due' ? rb.at : null;
      // A run with no instant the engine will use sorts after the ones that
      // have one, rather than ahead of them.
      if (na && nb) return na.localeCompare(nb);
      if (na) return -1;
      if (nb) return 1;
      return 0;
    });
  }, [campaigns, filter, stateOf, readoutFor]);

  /*
   * ─── SAVING A CAMPAIGN'S PUBLISHING WINDOW ─────────────────────────────
   *
   * "ההגדרות חייבות להישמר גם לאחר: Refresh, סגירת התוכנה, Login מחדש,
   *  Restart של השרת/אפליקציה." So every change is written to the campaign
   * row — there is no browser-local copy of any of this, and nothing here is
   * remembered in a way a different device would not see.
   *
   * WHY THE SCREEN UPDATES FIRST AND WRITES AFTER. These are chips and
   * selects: choosing Sunday, Monday and Thursday is three taps in under a
   * second, and a control that waits for a round trip before it lights up is
   * a control the owner taps twice. The state the panel draws is this page's
   * own `campaigns` array, patched immediately; the write follows.
   *
   * AND WHY IT IS DEBOUNCED. Those three taps would otherwise be three
   * updates to one row, racing each other, with the last one to LAND — not
   * the last one sent — deciding what is stored. One write, 600ms after the
   * owner stops, settles that. The ref holds one timer per campaign, so two
   * cards being set up at once do not cancel each other.
   *
   * ON FAILURE THE SCREEN GOES BACK. A row that refused the write (most
   * likely: social-latest.sql has not been run, and errors.ts says exactly
   * that) must not leave the card showing a window the engine has never heard
   * of — that is the screen promising something the machine will not do.
   */
  const scheduleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [scheduleBusy, setScheduleBusy] = useState<Record<string, boolean>>({});
  /*
   * The dashboard solved this three ways and none of them were ported here:
   * the pending edit lives in its own record (declared above, beside the
   * reader that lays it over the stored row), the pending write is a FUNCTION
   * so an unmount can flush it instead of dropping it, and the patch is
   * dropped only once the stored row agrees.
   */
  /* What each pending timer would write, so the cleanup can run it. */
  const schedulePending = useRef<Record<string, () => Promise<void>>>({});
  /*
   * ON UNMOUNT THE PENDING SAVE IS FLUSHED, NOT DROPPED.
   *
   * This cleared the timer and stopped. The editor is three selects and seven
   * day chips on a phone, so a tap followed by a swipe to another screen
   * inside 600ms lost the change silently — with the card having already shown
   * it as made. A write that was asked for is sent; what cannot survive an
   * unmount is the toast about it, which is the smaller loss.
   */
  useEffect(
    () => () => {
      for (const [id, timer] of Object.entries(scheduleTimers.current)) {
        clearTimeout(timer);
        void schedulePending.current[id]?.();
      }
    },
    [],
  );

  const changeSchedule = useCallback(
    (campaign: Campaign, next: CampaignSchedule) => {
      const columns = scheduleColumns(next);
      /* Into its own record, not into `campaigns` — the five-second read owns
         that list and would put the stored row straight back. */
      setSchedulePatch((all) => ({ ...all, [campaign.id]: columns }));
      /* THE WRITE, AS A FUNCTION, so the unmount cleanup can run it. */
      const run = async () => {
        delete schedulePending.current[campaign.id];
        delete scheduleTimers.current[campaign.id];
        setScheduleBusy((b) => ({ ...b, [campaign.id]: true }));
        try {
          await saveCampaign({ id: campaign.id, name: campaign.name, ...columns });
          /* And the repeat is re-armed with the new hours — see the note on the
             dashboard's copy of this. A weekly row built from the OLD start
             hour is the card saying one thing while the engine does another. */
          const repeat = readRepeat(campaign, floorHours);
          if (!repeat.enabled) {
            /*
             * ─── AN ACTIVE WEEKLY ROW WITH THE SWITCH OFF STILL PUBLISHES ──
             *
             * "הוא לא מחליף לי את השעה לתזמון שקבעתי — הוא משאיר את אותו השעה
             *  שהיה רשום בקמפיין."
             *
             * The guard above is right that a campaign which does not repeat
             * has no weekly row to ARM. What it assumed is that there is then
             * no weekly row at all — and a launch from the editor creates an
             * active one without touching the repeat columns. In that state
             * the campaign's hour was a second, ignored record and the planner
             * kept using the hour it replaced.
             *
             * This re-arms the HOURS of rows that are already active and
             * already weekly, and nothing else: it cannot create a recurrence
             * the owner did not ask for, which is what the guard protects.
             */
            const synced = await syncWeeklyHours(campaign.id, next);
            if (synced.skippedNoDay) {
              toast('השעה נשמרה, אבל לא נבחר אף יום פרסום — עד שתבחרו יום, לא ייכנסו פרסומים לתור.', 'info');
            } else if (synced.rearmed) {
              toast(`השעה עודכנה גם בתזמון שהסבב באמת עובד לפיו (${synced.rearmed}) — הפרסומים הבאים ייצאו בשעה החדשה.`, 'success');
            }
          }
          if (repeat.enabled) {
            const armedNow = await setCampaignRepeat(campaign, repeat, next, floorHours);
          /*
           * AND IF THE RE-ARM COULD NOT HAPPEN, HE HEARS IT NOW — on the save
           * that he made, not on an evening he spends waiting.
           *
           * "אני רוצה שמתי שאני משנה שם ימים / שעות שזה יתעדכן באותו הרגע."
           * He is right, and this is the half that was silent: changing the
           * days re-arms the weekly row, and a round that has never gone out
           * has no group list to re-arm WITH. That used to pass without a
           * word, leaving a panel that said "שבת · 19:00" over a queue that
           * would never receive a row.
           */
            if (!armedNow.armed) {
              toast(
                repeatRefusedText(campaign.name, armedNow.refused) ??
                  `התזמון נשמר, אבל "${campaign.name}" עוד לא יצא אף פעם — אין ממה להעתיק את רשימת הקבוצות, ולכן לא ייכנסו פרסומים לתור. השיקו אותו פעם אחת וזה יתפוס מיד.`,
                'error',
              );
            }
          }

          /* And the account-wide floor comes down with it, exactly as on the
             dashboard — see the long note on the dashboard's copy. Without it
             the gap chosen here is only the first of two gates and the second
             one, 65 minutes out of the box, decides.

             ONLY WHEN THE GATE IS ON, for the reason spelled out on the
             dashboard's copy: a gap that enforces nothing may not lower an
             account-wide floor that enforces everything, and this call never
             raises it back. */
          const floor = next.enabled
            ? await matchAccountGapTo(next.gapSeconds)
            : { changed: false, wasSeconds: 0, nowSeconds: 0 };
          if (floor.changed) {
            toast(
              `המרווח המינימלי של כל החשבון ירד מ-${accountGapLabel(floor.wasSeconds)} ל-${accountGapLabel(floor.nowSeconds)} — זה חל על כל הסבבים, לא רק על זה`,
              'info',
            );
          }

          /* AND THE QUEUE MOVES WITH THE HOURS — the same call the dashboard
             makes, for the same reason, because this is the same record and a
             second policy for it is a second truth. The long note is on
             rescheduleCampaignQueue itself. Last, so a failed campaign write
             never re-times a queue to a schedule that was not saved. */
          const queue = await rescheduleCampaignQueue(campaign.id, next);
          if (queue.moved) {
            toast(
              `${counted(queue.moved, 'פרסום אחד הוזז', 'פרסומים הוזזו', 'שני פרסומים הוזזו')} לשעות החדשות${
                queue.capped ? ` (רק ${queue.waiting} הקרובים בתור)` : ''
              }`,
              'success',
            );
          } else {
            /*
             * ─── A STORED HOUR THAT GOVERNS NOTHING MUST SAY SO ────────────
             *
             * rescheduleCampaignQueue returns immediately when the window
             * switch is off — deliberately: with no window there is nothing to
             * roll rows into, and re-spacing a queue because the owner turned a
             * switch OFF would be a change he did not ask for. But it also
             * swallowed the opposite case, which is the one he reported: he
             * SET an hour, and nothing moved, and nothing said why.
             *
             * Only when the switch itself did not change — turning it off is a
             * deliberate act and does not need this sentence — and only when
             * the window content actually did.
             */
            const was = readSchedule(campaign);
            const windowChanged =
              next.start !== was.start || next.gapSeconds !== was.gapSeconds || next.days.join(',') !== was.days.join(',');
            if (!next.enabled && next.enabled === was.enabled && windowChanged) {
              toast(
                'השעה נשמרה, אבל מתג התזמון של הסבב כבוי — עד שתדליקו אותו היא לא שולטת על הפרסומים, והם ימשיכו לפי מה שכבר בתור.',
                'info',
              );
            }
          }
          await load();
        } catch (err) {
          /*
           * THE PATCH IS DROPPED, so the card goes back to what the database
           * holds. A row that refused the write (most likely cause, and what
           * errors.ts will say: supabase/social-latest.sql has not been run)
           * must not leave the card showing a window the engine has never
           * heard of — that is the screen promising something the machine will
           * not do.
           */
          setSchedulePatch((all) => {
            const rest = { ...all };
            delete rest[campaign.id];
            return rest;
          });
          toast(friendlyMessage(err, 'שמירת התזמון נכשלה.'), 'error');
        } finally {
          setScheduleBusy((b) => ({ ...b, [campaign.id]: false }));
        }
      };

      schedulePending.current[campaign.id] = run;
      clearTimeout(scheduleTimers.current[campaign.id]);
      scheduleTimers.current[campaign.id] = setTimeout(run, 600);
    },
    [toast, load, floorHours],
  );

  /*
   * AND THE PATCH IS DROPPED ONLY ONCE THE STORED ROW AGREES WITH IT.
   *
   * Not on the write returning: `load()` is what refills the list, and between
   * the write settling and that read landing the card would flick back to the
   * old value for one frame. Comparing what the row RESOLVES to rather than
   * the raw columns, because a database that has not run the migration returns
   * no columns at all and readSchedule() turning that into the defaults is the
   * honest answer to "what is this campaign set to".
   */
  useEffect(() => {
    const ids = Object.keys(schedulePatch);
    if (!ids.length || !campaigns) return;
    const settled = ids.filter((id) => {
      const row = campaigns.find((c) => c.id === id);
      if (!row) return false;
      const live = scheduleColumns(readSchedule(row));
      const want = schedulePatch[id];
      return (
        live.schedule_enabled === want.schedule_enabled &&
        live.schedule_start === want.schedule_start &&
        /* The SECONDS are what the owner chose; the minutes beside them are
           derived from it, and the derived one is coarser — it would call a
           change from 30 to 40 seconds "no change". */
        live.schedule_gap_seconds === want.schedule_gap_seconds &&
        live.schedule_days.join(',') === want.schedule_days.join(',')
      );
    });
    if (!settled.length) return;
    setSchedulePatch((all) => {
      const rest = { ...all };
      for (const id of settled) delete rest[id];
      return rest;
    });
  }, [campaigns, schedulePatch]);


  /*
   * CHZARA — the same switch the dashboard carries, on the screen where this
   * panel is the whole feature.
   *
   * NO DEBOUNCE, unlike the five controls above it. Those are dragged; this is
   * one press with a consequence outside the campaign — a weekly schedule row
   * that publishes to every group in the round tomorrow morning — and it is
   * written and reloaded immediately so the card shows what it just armed.
   */
  /*
   * סבבים ביום — the hours, then the plan the engine walks.
   *
   * Optimistic like every other write on this screen, because the 60-second
   * poll owns `campaigns` and replaces it wholesale: without writing the new
   * value into the list, the card visibly reverts mid-edit, which is the
   * complaint "שינויים בהגדרות קמפיין לא נשמרים" in its original form.
   */
  const changeRepeat = useCallback(
    async (campaign: Campaign, next: CampaignRepeat) => {
      setScheduleBusy((b) => ({ ...b, [campaign.id]: true }));
      try {
        const result = await setCampaignRepeat(campaign, next, readSchedule(campaign), floorHours);
        setCampaigns((list) => (list ?? []).map((c) => (c.id === campaign.id ? { ...c, ...repeatColumns(next, floorHours) } : c)));
        /*
         * THE TOAST SAYS WHAT HAPPENED, not what was asked for.
         *
         * It used to promise a daily repeat whenever the switch went on. A
         * round that has never been launched cannot be armed — there is no
         * group list to repeat, because the list lives on the schedule row
         * that launched it and a campaign has no groups of its own. So that
         * promise was false for exactly the campaigns the owner was most
         * likely to be looking at: the new ones.
         */
        toast(
          !next.enabled
            ? `החזרה היומית של "${campaign.name}" כובתה — הסבב הנוכחי ימשיך כרגיל`
            : result.armed
              ? `"${campaign.name}" יחזור על עצמו בכל יום פרסום`
              : /* THREE FACTS, NOT ONE. See repeatRefusedText(). */
                (repeatRefusedText(campaign.name, result.refused) ??
                `"${campaign.name}" עוד לא יצא אף פעם, ולכן אין ממה להעתיק את רשימת הקבוצות. השיקו אותו פעם אחת — בחרו קבוצות ושלחו — ומשם זה יחזור כל יום לבד.`),
          !next.enabled ? 'success' : result.armed ? 'info' : 'error',
        );
      } catch (err) {
        toast(friendlyMessage(err, 'שמירת החזרה נכשלה.'), 'error');
      } finally {
        setScheduleBusy((b) => ({ ...b, [campaign.id]: false }));
      }
    },
    [toast, floorHours],
  );

  /**
   * "החזר לפעילות" — AND MAKING IT MEAN WHAT IT SAYS.
   *
   * "למה במסך קמפיינים אין כפתור להדלקת קמפיינים." The button is on the card
   * now, and the first thing to check was whether the handler behind it does
   * anything. It did not, quite:
   *
   *   stopCampaign() writes three things (client.ts) — status 'archived',
   *   social_schedules.active = false for every post of the round, and every
   *   cancellable queue row swept to 'skipped'.
   *
   *   reopenCampaign() undoes exactly one of them. Its own docstring says so:
   *   "re-opens a stopped campaign FOR EDITING; it does not resurrect
   *   cancelled rows."
   *
   * And planQueue() reads `social_schedules` WHERE active = true. So the
   * status flip on its own gives back a campaign that is on every list as
   * live, editable, badged as never-started — and invisible to the planner
   * for ever. As a row in a menu nobody found, that was a quiet oddity. As
   * the card's own button it would be the worst kind of control: one that
   * reports success and changes nothing the owner can see.
   *
   * WORSE THAN NOTHING, FOR ONE SHAPE OF ROUND. scheduleReadout() computes
   * `repeats = repeat.enabled && !stopped`, so the moment 'stopped' goes
   * away a round with the daily repeat armed starts printing "חזרה יומית
   * פעילה — הסבב הבא ייפתח ב-24.10 בשעה 08:00" over a schedule row that is
   * switched off. A dated promise about a publication that cannot happen is
   * precisely the fault "למה הוא לא מראה מתי אמור לצאת הפרסום הבא" was fixed
   * to remove.
   *
   * SO THE RE-ARM IS PART OF THE PRESS, in this order and not the other:
   * setCampaignRepeat() is the only thing in the product that sets
   * social_schedules.active = true, and plan.ts retires the schedules of any
   * campaign still marked 'archived' on its next pass — within sixty seconds.
   * Re-arm first and it is undone before the owner looks up.
   *
   * It is the SAME call the schedule panel already makes on every day or hour
   * change (changeSchedule above), including its answer when there is nothing
   * to copy: a round that has never gone out owns no group list, so `armed`
   * comes back 0 and he is told to launch it once rather than left waiting.
   *
   * WHEN THE REPEAT IS OFF, nothing is re-armed and nothing pretends
   * otherwise — a round whose repeat is off ended when it ended, and the
   * toast says what starts a new one.
   */
  async function reopen(campaign: Campaign, was: 'stopped' | 'completed') {
    setBusy(`open-${campaign.id}`);
    /* Which of the two writes landed, so the message after a failure can say
       what is true rather than "הפעולה נכשלה" over a campaign that IS open. */
    let reopened = false;
    try {
      await reopenCampaign(campaign.id);
      reopened = true;
      const repeat = readRepeat(campaign, floorHours);
      const schedule = readSchedule(campaign);
      if (!repeat.enabled) {
        /* Nothing is armed and nothing pretends otherwise. The two routes out
           are both on this card, and the sentence names them rather than
           leaving him pressing a button that reports success and changes
           nothing he can see. */
        toast('הקמפיין חזר לפעילות, אבל החזרה היומית כבויה — הדליקו אותה בכרטיס, או פתחו את הפוסט והשיקו אותו מחדש.', 'info');
      } else {
        const armed = await setCampaignRepeat(campaign, repeat, schedule, floorHours);
        /*
         * A WEEKLY PLAN IS BUILT OUT OF THE CHOSEN DAYS — `for (const day of
         * schedule.days) weekly[day] = [start]` — so with no day chosen it is
         * an empty object, and setCampaignRepeat still counts the row it
         * wrote as armed. It is active, it has no occasion, and it will plan
         * nothing for ever. The switch is on; the answer the owner needs is
         * which other control is holding it.
         */
        const noDay = !schedule.days.length;
        if (armed.armed > 0 && !noDay) {
          /* WHAT COMES BACK AND WHAT DOES NOT — and the two cases differ.
             stopCampaign swept every row that had not begun to 'skipped', and
             nothing in this product un-skips a row, so a STOPPED round
             resumes at its next publishing day rather than carrying on from
             the minute it was stopped; saying "הפרסומים ייכנסו לתור" without
             that is a promise about today. A round that merely FINISHED had
             nothing to sweep, and telling it that publications were cancelled
             would be a sentence about something that never happened. */
          toast(
            was === 'stopped'
              ? 'הקמפיין חזר לפעילות והחזרה היומית הופעלה מחדש. הפרסומים שבוטלו בעצירה לא חוזרים — הסבב ימשיך מיום הפרסום הבא.'
              : 'הקמפיין חזר לפעילות והחזרה היומית הופעלה מחדש — הסבב ייפתח שוב ביום הפרסום הבא.',
          );
        } else if (noDay) {
          toast('הקמפיין חזר לפעילות, אבל לא נבחר אף יום פרסום — בחרו לפחות יום אחד בכרטיס כדי שייכנסו פרסומים לתור.', 'info');
        } else if (armed.needsLaunch > 0) {
          /* The round owns no group list to copy. Same answer the schedule
             panel gives on a day or hour change, in the same words. */
          toast(`הקמפיין חזר לפעילות, אבל "${campaign.name}" עוד לא יצא אף פעם — אין ממה להעתיק את רשימת הקבוצות. פתחו את הפוסט והשיקו אותו פעם אחת.`, 'info');
        } else {
          /* armed 0 AND needsLaunch 0 is the third shape, and it is not the
             same sentence: setCampaignRepeat returns it when the campaign has
             no post at all. */
          toast('הקמפיין חזר לפעילות, אבל אין בו פוסט — הוסיפו פוסט והשיקו אותו.', 'info');
        }
      }
      await load();
    } catch (err) {
      toast(
        reopened
          ? 'הקמפיין חזר לפעילות, אבל החזרה היומית לא הופעלה מחדש. נסו שוב.'
          : friendlyMessage(err, 'הפעולה נכשלה.'),
        'error',
      );
      /* THE SCREEN MUST MATCH THE DATABASE EVEN WHEN THE SECOND WRITE FAILED,
         because the first one landed: without this the card keeps its old
         'נעצר' badge over an open campaign, and the button that would retry
         is drawn from that stale state. Its own failure is swallowed — the
         error above is the one worth reading. */
      await load().catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Delete a run — and stop it on the way out.
   *
   * Deleting the campaign row sets social_queue.campaign_id to NULL (the FK is
   * `on delete set null`), and rules.ts only honours a pause or a stop when a
   * row HAS a campaign id: `if (campaignId)`. So a deleted run's publications
   * lose the only guard that could hold them and keep going out — with no run
   * card left anywhere to pause them from. The owner deletes a round precisely
   * to stop it, and watches posts land in groups for hours afterwards.
   *
   * The old confirmation mentioned the posts and the history and never the
   * queue, and carried no number at all. This one counts exactly what will be
   * cancelled — cancellableRows(), the same list stopCampaign() acts on, so
   * the number in the question is the number the write delivers — and then
   * cancels it before deleting. A publication already in flight is left to
   * finish, which is why it is not in the count.
   */
  async function removeCampaign(c: Campaign, state: CampaignState) {
    const waiting = cancellableRows(state.progress);
    const ok = await confirm.ask({
      title: 'למחוק את הקמפיין?',
      body: (
        <>
          {waiting > 0
            ? `${waiting === 1 ? 'פרסום אחד שטרם יצא יבוטל' : `${waiting} פרסומים שטרם יצאו יבוטלו`} — מחיקה בלי לבטל הייתה משאירה אותם יוצאים לבד, בלי שום מקום לעצור אותם. `
            : 'שום פרסום לא ממתין לצאת. '}
          הפוסטים עצמם יישארו במערכת ללא שיוך לקמפיין, והיסטוריית הפרסומים לא נמחקת. אי אפשר לבטל את הפעולה.
        </>
      ),
      confirmLabel: waiting > 0 ? 'בטל ומחק' : 'מחק',
      danger: true,
    });
    if (!ok) return;
    await act(
      `del-${c.id}`,
      async () => {
        // Order matters: once the campaign row is gone the queue rows are
        // orphaned and stopCampaign() can no longer find them.
        if (waiting > 0) await stopCampaign(c.id);
        await deleteCampaign(c.id);
      },
      waiting > 0 ? `הקמפיין נמחק ו-${waiting} פרסומים בוטלו.` : 'הקמפיין נמחק.',
    );
  }

  return (
    <SocialShell
      /* PULL DOWN TO RELOAD — the same loader this screen's own actions call. */
      onRefresh={load}
      title="קמפיינים"
      lede="כל קמפיין שהפעלתם — מה יצא, מה עוד יוצא, ומה אפשר לעצור"
      /*
       * "+ קמפיין חדש" GOES TO THE POST EDITOR, and the detour it replaces is
       * worth writing down.
       *
       * The comment that originally stood here said: no "new run" action,
       * because a run is created by publishing a post. A brief asked for the
       * button and I wired it to this page's own editing sheet — name,
       * service, city, language and notes. That call did create a campaign
       * row, so it was not broken; it was the wrong thing entirely.
       * The owner pressed it expecting to write a post, attach pictures, pick
       * groups and set a time, and got a five-field form that produces an
       * empty shell: "למה לא נותן לי לרשום פוסט להוסיף תמונות לתזמן כמו שהיה
       * לפני". A campaign with no post in it is not a campaign, it is a name.
       *
       * So the button goes where that work actually happens. /social/posts/new
       * is the editor with the text, the media, the group picker and the
       * scheduler in it, and ensureRunForPost() opens the campaign by itself
       * the moment the post is scheduled — which is why this screen never had
       * a create button to begin with.
       *
       * AND THE SHEET IT USED TO OPEN IS GONE — "את זה תמחק לא רלוונטי."
       * "ערוך" now opens the post: its text and its pictures, which is what
       * actually goes out. One consequence worth writing down: a campaign's
       * name was only ever editable there, so it is now fixed at whatever the
       * post was called when the run opened (ensureRunForPost names it).
       */
      /* The reference's primary: taller than the product's default button and
         at the card radius rather than the button one, because on this screen
         it sits beside a 26px title rather than inside a row of controls.
         `!rounded-2xl` — BUTTON_BASE carries rounded-xl and both are one-class
         radius utilities in the same layer. Same href, same destination. */
      headerAction={
        <ButtonLink href="/social/posts/new" size="lg" className="h-14 !rounded-2xl !px-5 text-[15px]">
          + קמפיין חדש
        </ButtonLink>
      }
      paused={control?.paused ?? null}
      onControlChanged={load}
    >
      <div className="space-y-4">
        {/* A failed read used to leave a red banner above a skeleton that
            shimmered for ever, with no way out but a browser reload — on a
            phone, for an owner who is not technical. */}
        {error && <ErrorState message={error} onRetry={load} />}

        {/* The counts are omitted, not zeroed, until the list is known.
            These chips render above the skeleton, so offline or on a schema
            error the owner saw "פעילים 0 · הסתיימו 0 · הכל 0" sitting under
            the error banner — three numbers that came from a useMemo over an
            empty array, not from the database. House rule 1: a number on
            screen is read from the database or it does not exist. */}
        {/* "Segmented Control אחד רחב עם 3 אפשרויות... Container לבן, border
            עדין, 3 חלקים שווים, Tab פעיל: רקע סגול מלא." That is the `tabs`
            variant in ui.tsx; the counts below are the ones this page already
            computed, and they are still omitted rather than zeroed until the
            list is known. */}
        <SegmentedControl
          variant="tabs"
          label="סינון קמפיינים"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'live', label: 'פעילים', count: campaigns ? counts.live : undefined },
            { value: 'done', label: 'הסתיימו', count: campaigns ? counts.done : undefined },
            { value: 'all', label: 'הכל', count: campaigns ? counts.all : undefined },
          ]}
        />

        {!campaigns && !error && (
          <Card>
            <SkeletonList rows={3} />
          </Card>
        )}

        {campaigns && visible.length === 0 && (
          <EmptyState
            icon={<MegaphoneIcon className="h-5 w-5" />}
            title={counts.all === 0 ? 'עדיין לא הפעלתם פרסום' : 'אין קמפיינים בסינון הזה'}
            description={
              counts.all === 0
                ? 'קמפיין הוא המסגרת שמאגדת פוסטים לפי שירות ועיר — למשל "ניקוי ספות באר שבע". אחר כך מוסיפים לו פוסט ובוחרים קבוצות.'
                : 'החליפו סינון כדי לראות את השאר.'
            }
            /* The same destination the header button uses. An owner with no
               campaigns at all usually has no posts either, so the library is
               a room with nothing in it; the post editor is where the first
               campaign is actually made. */
            action={counts.all === 0 ? <ButtonLink href="/social/posts/new">כתבו את הפוסט הראשון</ButtonLink> : undefined}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {visible.map((c) => {
            const state = stateOf(c);
            /* Which kind of "over" this round is, or null when it is not over
               at all — see the note on onReopen below. Narrowed here because
               the handler's message depends on the answer. */
            const ended: 'stopped' | 'completed' | null =
              state.state === 'stopped' || state.state === 'completed' ? state.state : null;
            const mine = posts.filter((p) => p.campaign_id === c.id);
            return (
              <CampaignCard
                key={c.id}
                campaign={c}
                state={state}
                /* The cover of the run's post, and the next group's own
                   picture — both already loaded, neither was being shown. */
                media={mine.find((p) => p.media?.length)?.media ?? null}
                nextTargetImage={state.upcoming.find((r) => r.target?.image_url)?.target?.image_url ?? null}
                hasPost={mine.length > 0}
                postCount={mine.length}
                globalPaused={control?.paused ?? false}
                workerOnline={workerOnline}
                /*
                 * `del-` IS IN THIS LIST AND IT WAS NOT, which an audit of my
                 * own change caught before the owner did.
                 *
                 * removeCampaign() runs under act(`del-${c.id}`) — a
                 * stopCampaign, a deleteCampaign and then a full eight-query
                 * reload. Every other key the card can start is here, so the
                 * card greys out while they run; `del-` was missing, so the
                 * one control that is now VISIBLE on the card stayed live
                 * through the slowest write on the screen. A second tap on it
                 * re-opens a confirmation for a campaign that is already being
                 * deleted.
                 */
                busy={busy === `pause-${c.id}` || busy === `resume-${c.id}` || busy === `dup-${c.id}` || busy === `open-${c.id}` || busy === `del-${c.id}`}
                onPause={() => act(`pause-${c.id}`, () => pauseCampaign(c.id, true), 'הקמפיין נעצר.')}
                onResume={() => act(`resume-${c.id}`, () => pauseCampaign(c.id, false), 'הקמפיין ממשיך.')}
                /*
                 * THE SAME HANDLERS THAT USED TO SIT IN A ROW UNDER THE CARD,
                 * handed to it instead. Not one of them is new or rewritten —
                 * duplicateCampaign, reopenCampaign, setCommentFor and
                 * removeCampaign are exactly the functions this page
                 * already called; only the place they are drawn has moved,
                 * from between two cards into the border of the one they act
                 * on. A red "מחק" a thumb-width from "שכפל", belonging to
                 * neither card visibly, is what that row was.
                 */
                addPostHref={`/social/posts/new?campaign=${c.id}`}
                /* "תוסיף כאן הגדרות תור מתקדם כמו בעמוד ראשי" — the same sheet
                   the dashboard's run card opens, scoped to this round. It is
                   the only control in the product that re-times rows already
                   in the queue, and it was reachable from one screen only. */
                onTune={() => setTuner({ campaignId: c.id })}
                /*
                 * "ערוך" PRESSED ON A CAMPAIGN OPENS ITS POST.
                 *
                 * "אני רוצה שיהיה אפשר לערוך את טקסט הפרסום / תמונת מדיה של
                 *  הפוסט ולא את מה שזה נותן עכשיו."
                 *
                 * `mine` is this campaign's posts and listCampaignPosts() orders by
                 * updated_at descending, so mine[0] is the one last worked on
                 * — the same post whose cover this card is already showing.
                 * A campaign with no post at all gets the editor on a new one,
                 * already attached to it, which is where "+ הוסף פוסט" goes.
                 */
                editHref={mine.length ? `/social/posts/${mine[0].id}` : `/social/posts/new?campaign=${c.id}`}
                onDuplicate={() => act(`dup-${c.id}`, () => duplicateCampaign(c.id), 'העתק נוצר.')}
                /*
                 * ─── A ROUND THAT IS OVER CAN BE STARTED AGAIN ─────────────
                 *
                 * "אצל הלקוח שלי בטלפון אין האופציה להחזיר פעילות, אצלי כן,
                 *  ושנינו על אותה גרסה."
                 *
                 * They were. The difference was never the version or the
                 * account: this read `state === 'stopped'`, and 'stopped'
                 * means one thing only — `campaign.status === 'archived'`,
                 * i.e. a round the owner ended by hand. A round that simply
                 * ran out of rows is 'completed'. BOTH sit under the same
                 * "הסתיימו" tab, so two cards that read as finished behaved
                 * differently for a reason nothing on the screen showed.
                 *
                 * Now both offer it, and reopen() is told which it was: a
                 * stopped round had its queue swept and has to say so, a
                 * completed one had nothing to sweep and must not claim it.
                 *
                 * NOT 'not_started'. A round that has never gone out is not
                 * being "returned" to anything — its card already says so and
                 * points at "+ הוסף פוסט", which is the thing that starts it.
                 */
                onReopen={ended ? () => reopen(c, ended) : undefined}
                /*
                  THE REASON THIS ACTION EXISTS, in the owner's own words:
                  "even if two hours have passed, even if a day — I pick the
                  round and schedule the comment on the whole thing."

                  Offered only once something has published, because before
                  that there is nothing to comment on.
                */
                onComment={state.progress.published > 0 ? () => setCommentFor(c) : undefined}
                onDelete={() => removeCampaign(c, state)}
                /*
                 * "תזמון פרסום", read straight off the campaign row. A row from
                 * a database that has not run social-latest.sql has none of
                 * these columns and readSchedule() answers `enabled: false` —
                 * so the panel draws, the owner can set it up, and only
                 * pressing the switch reports the migration is missing.
                 */
                schedule={scheduleOf(c)}
                onScheduleChange={(next) => changeSchedule(c, next)}
                spacing={spacing}
                repeat={readRepeat(c, floorHours)}
                onRepeatChange={(next) => void changeRepeat(c, next)}
                /* The account's own protection from Settings, so this list
                   measures his rounds against the same number the dashboard
                   and the engine do. */
                floorHours={floorHours}
                scheduleBusy={scheduleBusy[c.id] ?? false}
              />            );
          })}
        </div>
      </div>

      {/*
        KEYED BY THE ROUND, and this is not a nicety.

        The sheet keeps its own text, picture and gap in useState, seeded from
        props on FIRST MOUNT. Mounted unconditionally it mounted once, at page
        load, with commentFor still null — so it opened empty for a round that
        already had a comment saved, and worse, opening it for a second round
        showed the FIRST round's text and picture while the title, the count
        and the button all said the second. Sending then wrote round A's
        comment onto every published post of round B.

        The key remounts it per round, which is what makes the props the
        source of the values on screen.
      */}
      <CampaignCommentSheet
        key={commentFor?.id ?? 'none'}
        open={commentFor !== null}
        onClose={() => setCommentFor(null)}
        /* The round's LIFETIME publications, which is what
           queueCampaignComment actually matches — `progress.published` is
           today's on a repeating round. Same reason as the dashboard's. */
        publishedCount={commentFor ? stateOf(commentFor).everPublished : 0}
        initialText={commentFor?.comment_text ?? ''}
        initialMedia={commentFor?.comment_media ?? []}
        initialGapSeconds={commentFor?.comment_gap_seconds ?? 30}
        busy={busy === 'comment'}
        onSubmit={(text, media, gapSeconds) => {
          const round = commentFor;
          if (!round) return;
          void act(
            'comment',
            async () => {
              await queueCampaignComment(round.id, text, media, gapSeconds);
              setCommentFor(null);
            },
            'נשלח. התגובות יתווספו אחת-אחת, במרווח שבחרתם.',
          );
        }}
      />

      <QueueTunerSheet
        open={tuner !== null}
        onClose={() => setTuner(null)}
        campaignId={tuner?.campaignId}
        /* Re-reads the rounds after a re-space, so the card's "הבא בתור" is
           the instant the tuner just wrote rather than the one it replaced. */
        onChanged={load}
      />
      {confirm.dialog}
    </SocialShell>
  );
}
