'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CampaignCard } from '@/components/social/CampaignCard';
import { CampaignCommentSheet } from '@/components/social/CampaignCommentSheet';
import { SocialShell } from '@/components/social/SocialShell';
import {
  Button,
  Card,
  ButtonLink,
  EmptyState,
  ErrorState,
  Field,
  SegmentedControl,
  Sheet,
  SkeletonList,
  inputClass,
  useConfirm,
  useToast,
} from '@/components/social/ui';
import {
  campaignStates,
  deleteCampaign,
  duplicateCampaign,
  getBusiness,
  getControl,
  listCampaigns,
  listPosts,
  listWorkers,
  pauseCampaign,
  queueCampaignComment,
  reopenCampaign,
  saveCampaign,
  stopCampaign,
} from '@/lib/social/client';
import { campaignState, cancellableRows, type CampaignState } from '@/lib/social/campaign';
import { DEFAULT_BUSINESS, type BusinessSettings, type Campaign, type ControlSettings, type Post } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { MegaphoneIcon } from '@/components/icons';

const blank = { name: '', service: '', city: '', language: 'he' as Campaign['language'], notes: '' };

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
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [states, setStates] = useState<Record<string, CampaignState>>({});
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);
  /*
   * The two machine facts every run badge on this screen depends on, and this
   * page read neither. Without the control row the cards showed a green
   * pulsing "רץ" while the PublishingToggle in the header of the same viewport
   * was amber "מושהה"; without the heartbeat a run whose laptop had been
   * asleep since yesterday pulsed as if it were publishing right now.
   * runBadge() in campaign.ts decides what they mean — the cards only render it.
   */
  const [control, setControl] = useState<ControlSettings | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | undefined>(undefined);
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [editorOpen, setEditorOpen] = useState(false);
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
      const [c, p, b, st, ctrl, workers] = await Promise.all([
        listCampaigns(),
        listPosts(),
        getBusiness(),
        campaignStates(),
        getControl(),
        listWorkers(),
      ]);
      setCampaigns(c);
      setPosts(p);
      setBusiness(b);
      setStates(st);
      setControl(ctrl);
      setWorkerOnline(workers.some((w) => w.online));
      setError(null);
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

  function openEditor(c?: Campaign) {
    setForm(c ? { id: c.id, name: c.name, service: c.service, city: c.city, language: c.language, notes: c.notes } : { ...blank, service: business.services[0], city: business.cities[0] });
    setEditorOpen(true);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    // Editing must never resurrect a stopped campaign, so status is only set
    // when the campaign is being created.
    const payload = form.id ? { ...form } : { ...form, status: 'active' as const };
    /* Reachable only from "ערוך" again, so the word is "עודכן" again — the
       conditional here was for a create path that has been taken away. */
    await act('save', () => saveCampaign(payload), 'הקמפיין עודכן.');
    setEditorOpen(false);
  }

  return (
    <SocialShell
      title="קמפיינים"
      lede="כל קמפיין שהפעלתם — מה יצא, מה עוד יוצא, ומה אפשר לעצור"
      /*
       * "+ קמפיין חדש" GOES TO THE POST EDITOR, and the detour it replaces is
       * worth writing down.
       *
       * The comment that originally stood here said: no "new run" action,
       * because a run is created by publishing a post. A brief asked for the
       * button and I wired it to openEditor() — this page's own sheet, which
       * is name, service, city, language and notes. That call does create a
       * campaign row, so it was not broken; it was the wrong thing entirely.
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
       * The sheet below stays exactly where it belongs: behind "ערוך" on a
       * campaign that already exists, for renaming it.
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
                 * openEditor, duplicateCampaign, reopenCampaign, setCommentFor
                 * and removeCampaign are exactly the functions this page
                 * already called; only the place they are drawn has moved,
                 * from between two cards into the border of the one they act
                 * on. A red "מחק" a thumb-width from "שכפל", belonging to
                 * neither card visibly, is what that row was.
                 */
                addPostHref={`/social/posts/new?campaign=${c.id}`}
                onEdit={() => openEditor(c)}
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

      <Sheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="עריכת קמפיין"
        footer={
          <div className="flex gap-2">
            <Button size="lg" busy={busy === 'save'} onClick={submit} className="grow" disabled={!form.name.trim()}>
              שמור שינויים
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setEditorOpen(false)}>
              ביטול
            </Button>
          </div>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <Field label="שירות">
            <select className={inputClass} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
              {business.services.map((s) => (
                <option key={s}>{s}</option>
              ))}
              <option value={form.service && !business.services.includes(form.service) ? form.service : 'אחר'}>אחר</option>
            </select>
          </Field>
          <Field label="עיר / אזור">
            <input className={inputClass} list="campaign-cities" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <datalist id="campaign-cities">
              {business.cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="שם הקמפיין" hint="כך הוא יופיע בלוח הבקרה ובהיסטוריה">
            <input
              className={inputClass}
              value={form.name}
              onFocus={() => setForm((f) => ({ ...f, name: f.name || `${f.service || ''} ${f.city || ''}`.trim() }))}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ניקוי ספות באר שבע"
            />
          </Field>
          <Field label="שפה">
            <select className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as Campaign['language'] })}>
              <option value="he">עברית</option>
              <option value="ru">רוסית</option>
              <option value="mixed">שתיהן</option>
            </select>
          </Field>
          <Field label="הערות">
            <textarea className={`${inputClass} min-h-20`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </form>
      </Sheet>
      {confirm.dialog}
    </SocialShell>
  );
}
