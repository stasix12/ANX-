'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CampaignCard } from '@/components/social/CampaignCard';
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
  setCampaignRepeat,
  stopCampaign,
} from '@/lib/social/client';
import { campaignState, cancellableRows, type CampaignState } from '@/lib/social/campaign';
import { SNAPSHOT, readSnapshot, writeSnapshot } from '@/lib/social/snapshot';
import { readRepeat, readSchedule, repeatColumns, scheduleColumns, type CampaignRepeat, type CampaignSchedule } from '@/lib/social/campaign-schedule';
import { accountGapLabel } from '@/lib/social/rules';
import { type AccountSpacing } from '@/lib/social/schedule-readout';
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
  const [workerOnline, setWorkerOnline] = useState<boolean | undefined>(seed?.workerOnline);
  /*
   * WHICH ROUND THE COMMENT SHEET IS ABOUT — and null when it is closed, so
   * one sheet serves every card instead of one mounted per row.
   */
  const [commentFor, setCommentFor] = useState<Campaign | null>(null);
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

  useEffect(() => {
    load();
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
  const visible = useMemo(() => {
    const list = campaigns ?? [];
    const finished = (c: Campaign) => ['completed', 'stopped'].includes(stateOf(c).state);
    const picked = filter === 'all' ? [...list] : filter === 'done' ? list.filter(finished) : list.filter((c) => !finished(c));
    return picked.sort((a, b) => {
      const sa = stateOf(a);
      const sb = stateOf(b);
      const live = Number(sb.progress.running > 0) - Number(sa.progress.running > 0);
      if (live) return live;
      // A run with nothing scheduled has no next instant; it sorts after the
      // ones that do rather than ahead of them.
      if (sa.nextAt && sb.nextAt) return sa.nextAt.localeCompare(sb.nextAt);
      if (sa.nextAt) return -1;
      if (sb.nextAt) return 1;
      return 0;
    });
  }, [campaigns, filter, stateOf]);

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
  useEffect(() => {
    const timers = scheduleTimers.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
    };
  }, []);

  const changeSchedule = useCallback(
    (campaign: Campaign, next: CampaignSchedule) => {
      const before = campaigns ?? [];
      const columns = scheduleColumns(next);
      setCampaigns(before.map((c) => (c.id === campaign.id ? { ...c, ...columns } : c)));
      clearTimeout(scheduleTimers.current[campaign.id]);
      scheduleTimers.current[campaign.id] = setTimeout(async () => {
        setScheduleBusy((b) => ({ ...b, [campaign.id]: true }));
        try {
          await saveCampaign({ id: campaign.id, name: campaign.name, ...columns });
          /* And the repeat is re-armed with the new hours — see the note on the
             dashboard's copy of this. A weekly row built from the OLD start
             hour is the card saying one thing while the engine does another. */
          const repeat = readRepeat(campaign);
          if (repeat.enabled) await setCampaignRepeat(campaign, repeat, next);

          /* And the account-wide floor comes down with it, exactly as on the
             dashboard — see the long note on the dashboard's copy. Without it
             the gap chosen here is only the first of two gates and the second
             one, 65 minutes out of the box, decides. */
          const floor = await matchAccountGapTo(next.gapSeconds);
          if (floor.changed) {
            toast(
              `המרווח המינימלי של כל החשבון ירד מ-${accountGapLabel(floor.wasSeconds)} ל-${accountGapLabel(floor.nowSeconds)} — זה חל על כל הסבבים, לא רק על זה`,
              'info',
            );
          }
        } catch (err) {
          /* Put the row back exactly as it was before this burst of taps. */
          setCampaigns((list) => (list ?? []).map((c) => (c.id === campaign.id ? (before.find((o) => o.id === c.id) ?? c) : c)));
          toast(friendlyMessage(err, 'שמירת התזמון נכשלה.'), 'error');
        } finally {
          setScheduleBusy((b) => ({ ...b, [campaign.id]: false }));
        }
      }, 600);
    },
    [campaigns, toast],
  );

  /*
   * CHZARA — the same switch the dashboard carries, on the screen where this
   * panel is the whole feature.
   *
   * NO DEBOUNCE, unlike the five controls above it. Those are dragged; this is
   * one press with a consequence outside the campaign — a weekly schedule row
   * that publishes to every group in the round tomorrow morning — and it is
   * written and reloaded immediately so the card shows what it just armed.
   */
  const changeRepeat = useCallback(
    async (campaign: Campaign, next: CampaignRepeat) => {
      setScheduleBusy((b) => ({ ...b, [campaign.id]: true }));
      try {
        await setCampaignRepeat(campaign, next, readSchedule(campaign));
        setCampaigns((list) => (list ?? []).map((c) => (c.id === campaign.id ? { ...c, ...repeatColumns(next) } : c)));
        toast(
          next.enabled
            ? `"${campaign.name}" יחזור על עצמו בכל יום פרסום`
            : `החזרה היומית של "${campaign.name}" כובתה — הסבב הנוכחי ימשיך כרגיל`,
          next.enabled ? 'info' : 'success',
        );
      } catch (err) {
        toast(friendlyMessage(err, 'שמירת החזרה נכשלה.'), 'error');
      } finally {
        setScheduleBusy((b) => ({ ...b, [campaign.id]: false }));
      }
    },
    [toast],
  );

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
                busy={busy === `pause-${c.id}` || busy === `resume-${c.id}` || busy === `dup-${c.id}` || busy === `open-${c.id}`}
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
                /* Only a stopped run can be put back — the card draws nothing
                   when this is undefined, which is how a menu item that cannot
                   act stays off the menu. */
                onReopen={state.state === 'stopped' ? () => act(`open-${c.id}`, () => reopenCampaign(c.id), 'הקמפיין חזר לפעילות.') : undefined}
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
                schedule={readSchedule(c)}
                onScheduleChange={(next) => changeSchedule(c, next)}
                spacing={spacing}
                repeat={readRepeat(c)}
                onRepeatChange={(next) => void changeRepeat(c, next)}
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
        publishedCount={commentFor ? stateOf(commentFor).progress.published : 0}
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

      {confirm.dialog}
    </SocialShell>
  );
}
