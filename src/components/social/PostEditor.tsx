'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, SparklesIcon, TrashIcon } from '@/components/icons';
import { LiveBoard } from '@/components/social/LiveBoard';
import { MediaUploader } from '@/components/social/MediaUploader';
import { TargetPicker } from '@/components/social/TargetPicker';
import { PostPreview } from '@/components/social/PostPreview';
import { PreLaunchReview } from '@/components/social/PreLaunchReview';
import { SchedulePicker, planFor, targetsLabel, type ScheduleDraft, scheduleDraftToInput } from '@/components/social/SchedulePicker';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Field, Loading, Notice, inputClass, useConfirm, useToast } from '@/components/social/ui';
import {
  archivePost,
  callSocialApi,
  countPublishedSince,
  createSchedule,
  ensureRunForPost,
  getBrowserSettings,
  getLimits,
  getBusiness,
  getPost,
  hasPendingQueue,
  listCampaigns,
  listQueue,
  listSchedules,
  listTargets,
  listVariants,
  savePost,
  saveVariants,
  setScheduleActive,
  type PostInput,
} from '@/lib/social/client';
import { generateVariantSeeds, renderPostText, whatsappUrlFor } from '@/lib/social/compose';
import { AUTOMATIC_WAITING_STATUSES, IN_FLIGHT_STATUSES } from '@/lib/social/status';
import { agree, counted, startOfZonedDay, zonedDateISO } from '@/lib/social/time';
import { stampText } from './DateTime';
import {
  CTA_OPTIONS,
  DEFAULT_BROWSER,
  DEFAULT_LIMITS,
  DEFAULT_BUSINESS,
  type BrowserSettings,
  type LimitsSettings,
  type BusinessSettings,
  type Campaign,
  type CtaType,
  type Language,
  type MediaItem,
  type QueueStatus,
  type Schedule,
  type SocialTarget,
  type Variant,
  type VariantStrategy,
} from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

type VariantDraft = Partial<Variant> & { key: string; label: string; text: string; language: Language; approval: Variant['approval'] };

const emptyPost: PostInput = {
  campaign_id: null,
  title: '',
  base_text: '',
  language: 'he',
  link_url: '',
  cta_type: '',
  phone: '',
  whatsapp_url: '',
  media: [],
  status: 'draft',
};

/**
 * One screen for the whole life of a post: compose → variants → approve →
 * pick targets → schedule. The preview on the side always shows the
 * currently selected variant rendered exactly as the worker will send it.
 */

/**
 * Where the owner actually finds the "test mode" switch.
 *
 * The toggle's label on the settings screen is "מצב בדיקה" and it lives on the
 * third tab, "פרסום בקבוצות". Saying "TEST MODE … אפשר לכבות בהגדרות" sent
 * them hunting for a name that is not written anywhere on that screen.
 */
const TEST_MODE_PATH = 'הגדרות ← פרסום בקבוצות ← "מצב בדיקה"';

/**
 * Rows that will eat a day's budget on their own, for the cap forecast below.
 *
 * rules.ts counts PUBLISHED rows against maxPerDay, so what matters for a day
 * still ahead is what is going to publish on it: the rows waiting on the clock
 * plus the one a worker is holding this second. Human-waiting rows
 * (awaiting_confirmation, manual_pending, needs_attention) are deliberately
 * out — nothing moves them until a person acts, and counting them as certain
 * traffic would overstate the warning.
 */
const CAP_CONSUMING_STATUSES: QueueStatus[] = [...AUTOMATIC_WAITING_STATUSES, ...IN_FLIGHT_STATUSES];

/**
 * How many waiting rows that forecast reads, once, at load.
 *
 * The read is ascending, so a queue deeper than this can only lose rows from
 * the FAR days — the ones a launch composed today is least likely to land on.
 * The effect is a warning that under-counts rather than one that invents: the
 * copy says "צפויים", and every number in it still comes from rows that exist.
 */
const CAP_SCAN_LIMIT = 500;

export function PostEditor({ postId }: { postId?: string }) {
  const router = useRouter();
  const [post, setPost] = useState<PostInput>(emptyPost);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [targets, setTargets] = useState<SocialTarget[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);
  const [browser, setBrowser] = useState<BrowserSettings>(DEFAULT_BROWSER);
  const [limits, setLimits] = useState<LimitsSettings>(DEFAULT_LIMITS);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [variantStrategy, setVariantStrategy] = useState<VariantStrategy>('rotate');
  const [variantMap, setVariantMap] = useState<Record<string, string>>({});
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [started, setStarted] = useState(false);
  // Read once: history.replaceState (after the first save) re-renders
  // useSearchParams, and re-running load() would wipe the form.
  const searchParams = useSearchParams();
  const presets = useRef({ campaign: searchParams.get('campaign'), targets: searchParams.get('targets') ?? '' });
  const loadedFor = useRef<string | undefined>('__never__');
  const [previewKey, setPreviewKey] = useState<string>('base');
  const [schedule, setSchedule] = useState<ScheduleDraft>({ mode: 'now', date: '', time: '09:00', weekly: {}, intervalDays: 2, intervalTime: '09:00', dripPerDay: 0, dripGapMinutes: 20, dripStart: '09:00', dripEnd: '20:00' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [savedId, setSavedId] = useState<string | undefined>(postId);
  const [reviewOpen, setReviewOpen] = useState(false);
  /*
   * How many publications have already gone out today. Needed to say anything
   * true about the daily cap: rules.ts counts what has been published today
   * against maxPerDay, so a warning computed from this launch alone would
   * understate it by exactly that number.
   */
  const [publishedToday, setPublishedToday] = useState(0);
  /*
   * Publications ALREADY in the queue for the days ahead, counted per local
   * day. The other half of the same truth: the cap is a ceiling on what goes
   * out on a day, so a launch landing on a day the queue has already filled is
   * over the ceiling before it adds a single slot. Counting only
   * `publishedToday` forecast 0 for exactly that case, and the rows were then
   * skipped without a word.
   *
   * One snapshot at load, like the quick-publish sheet (library.ts
   * quickPublishContext); the arithmetic re-runs locally on every keystroke.
   */
  const [queuedByDay, setQueuedByDay] = useState<Map<string, number>>(new Map());
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    if (loadedFor.current === postId) return;
    loadedFor.current = postId;
    const dayStart = startOfZonedDay(new Date()).toISOString();
    const [c, t, b, br, lim, doneToday, waiting] = await Promise.all([
      listCampaigns(),
      listTargets(),
      getBusiness(),
      getBrowserSettings(),
      getLimits(),
      countPublishedSince(dayStart),
      listQueue({ status: CAP_CONSUMING_STATUSES, since: dayStart, limit: CAP_SCAN_LIMIT, order: 'asc' }),
    ]);
    setPublishedToday(doneToday);
    const byDay = new Map<string, number>();
    for (const row of waiting) {
      const day = zonedDateISO(new Date(row.scheduled_at));
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    setQueuedByDay(byDay);
    /*
     * Targets the post was last scheduled to. Reopening a post used to fall
     * back to "every enabled Page", and an account with no Pages — which is
     * every groups-only account — landed on an empty selection and a button
     * that read "בדוק והתחל (0 יעדים)" with no explanation.
     */
    let lastTargets: string[] = [];
    setCampaigns(c);
    setTargets(t);
    setBusiness(b);
    setBrowser(br);
    setLimits(lim);
    setRequireConfirmation(br.requireConfirmation || br.testMode);
    if (postId) {
      const [p, v, s] = await Promise.all([getPost(postId), listVariants(postId), listSchedules(postId)]);
      if (p) {
        const { id: _id, created_at: _c, updated_at: _u, ...rest } = p;
        setPost(rest);
      }
      setVariants(v.map((x) => ({ ...x, key: x.id })));
      setSchedules(s);
      const recent = s.find((x) => x.active) ?? s[0];
      lastTargets = (recent?.target_ids ?? []).filter((id) => t.some((x) => x.id === id));
    } else {
      const presetCampaign = presets.current.campaign;
      setPost({ ...emptyPost, phone: b.phone, whatsapp_url: whatsappUrlFor(b.whatsapp), campaign_id: presetCampaign && c.some((x) => x.id === presetCampaign) ? presetCampaign : null });
    }
    const presetTargets = presets.current.targets.split(',').filter((id) => t.some((x) => x.id === id));
    /*
     * Nothing is ticked unless the owner asked for it.
     *
     * The last fallback used to be `defaultPages` — every enabled Facebook
     * Page. Measured: opening /social/posts/new cold and touching nothing, the
     * plan panel already read "1 יעדים — נכנסים לתור מיד". Pages publish
     * server-side through the official Graph API, so they go out immediately
     * and need no worker: a customer who came to post to GROUPS, typed their
     * text and hit the big CTA had published to their business Page without
     * ever choosing it. A preset from the URL or the post's own last targets
     * are real choices and still apply; "there happens to be a Page connected"
     * is not one.
     */
    setSelectedTargets((prev) => {
      if (prev.length) return prev;
      if (presetTargets.length) return presetTargets;
      return lastTargets;
    });
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    load().catch((err) => setMessage({ tone: 'error', text: friendlyMessage(err, 'טעינה נכשלה.') }));
  }, [load]);

  const campaign = campaigns.find((c) => c.id === post.campaign_id) ?? null;
  // Selected targets in the order they were picked — the drip planner walks
  // them in exactly this order, so the preview must too.
  const selectedObjects = useMemo(
    () => selectedTargets.map((id) => targets.find((t) => t.id === id)).filter((t): t is SocialTarget => Boolean(t)),
    [selectedTargets, targets],
  );
  /*
   * The spacing the planner will apply (plan.ts enforcedSpacing). It has to
   * reach BOTH the picker and this plan — the pre-launch review renders the
   * same SchedulePlanPreview, and a review that shows 28 publications at 09:00
   * for a schedule the planner spreads over a day and a half is the preview
   * lying at the last possible moment before the owner commits.
   */
  const spacingMinutes = limits.minGapMinutes + browser.groupMinGapMinutes;
  const plan = useMemo(
    () => planFor(schedule, selectedObjects.length, new Date(), spacingMinutes),
    [schedule, selectedObjects.length, spacingMinutes],
  );
  /**
   * How many of this launch's publications the daily cap will PUSH TO ANOTHER
   * DAY.
   *
   * It used to be how many it would DISCARD, and that was the honest reading
   * of the code: rules.ts returned {action:'skip'} on a full quota, so the row
   * was finished for good. It no longer does. A ceiling the owner sets is a
   * rate, not a verdict on a particular post, and the scheduling screen had
   * been promising "מה שלא נכנס היום ממשיך מחר" the whole time — so the rule
   * was changed to match the promise rather than the promise softened to match
   * the rule.
   *
   * The number still matters and is still shown: waiting is not free. It is
   * how long this launch will take to finish, which is a thing to know before
   * pressing the button.
   *
   * Counted per LOCAL day, because that is the window rules.ts counts, and
   * against what each of those days has already spent: today's publications,
   * and — on every day alike — the rows already waiting in the queue for it.
   * Without that second half a SECOND launch onto a day the queue had already
   * filled forecast 0 and then skipped in silence, which is the same defect
   * one level deeper.
   */
  const capOverflow = useMemo(() => {
    const cap = Math.max(0, Math.round(limits.maxPerDay ?? 0));
    if (!cap || !plan.slots.length) return 0;
    const perDay = new Map<string, number>();
    for (const slot of plan.slots) {
      const day = zonedDateISO(slot);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    const todayISO = zonedDateISO(new Date());
    let over = 0;
    for (const [day, count] of perDay) {
      const spent = (day === todayISO ? publishedToday : 0) + (queuedByDay.get(day) ?? 0);
      const budget = Math.max(0, cap - spent);
      over += Math.max(0, count - budget);
    }
    return over;
  }, [plan.slots, limits.maxPerDay, publishedToday, queuedByDay]);

  /**
   * The same number, said as the forecast it is.
   *
   * It is a projection about slots hours or days away, computed from a ceiling
   * the owner sets themselves and from a queue that keeps changing until the
   * slot arrives — so it is worded as one, with the levers that move it named.
   * The consequence is no longer the alarming half: a publication that loses
   * its slot waits for the first day with room. Saying otherwise would now be
   * false, and it frightened people away from launches that would have
   * finished perfectly well a day later.
   */
  const capWarning = (() => {
    if (capOverflow <= 0) return '';
    // One publication is "הפרסום", not "1 מתוך 1"; one out of many takes the
    // singular verb. Same rule the time labels follow (time.ts relativeHe).
    const howMany =
      plan.slots.length === 1
        ? 'צפוי שהפרסום הזה יידחה למחר'
        : capOverflow === 1
          ? `צפוי שפרסום אחד מתוך ${plan.slots.length} יידחה למחר`
          : `צפויים ${capOverflow} מתוך ${plan.slots.length} הפרסומים להידחות למחר`;
    return `לפי המכסה היומית שהגדרתם (${limits.maxPerDay} ליום), וכולל מה שכבר יצא היום ומה שכבר ממתין בתור לאותם ימים, ${howMany}. פרסום שנדחה אינו אובד — הוא ממתין ליום הראשון שיש בו מקום. כדי שזה יצא מוקדם יותר: העלו את המכסה בהגדרות, פרסו את הפרסום על פני יותר ימים, או בחרו פחות יעדים.`;
  })();

  const previewVariant = variants.find((v) => v.key === previewKey) ?? null;
  const previewText = useMemo(() => renderPostText(post, previewVariant), [post, previewVariant]);
  const approvedCount = variants.filter((v) => v.approval === 'approved').length;
  /* The name the preview signs the post with. It used to prefer a connected
     Facebook Page's name; with Pages gone, the business's own name is the
     only answer — and it always was, for an account with no Pages. */
  const pageName = business.name;

  function update<K extends keyof PostInput>(key: K, value: PostInput[K]) {
    setPost((p) => ({ ...p, [key]: value }));
  }

  function addVariant(seed?: { label: string; text: string; language: Language }) {
    const label = seed?.label ?? String.fromCharCode(65 + variants.length);
    setVariants((v) => [...v, { key: crypto.randomUUID(), label, text: seed?.text ?? '', language: seed?.language ?? post.language, approval: 'pending' }]);
  }

  function generate() {
    const seeds = generateVariantSeeds({
      service: campaign?.service || business.services[0],
      city: campaign?.city || business.cities[0],
      language: post.language,
      business,
    });
    setVariants((v) => [
      ...v,
      ...seeds.map((s) => ({ key: crypto.randomUUID(), label: `${s.label} · ${s.title}`, text: s.text, language: s.language, approval: 'pending' as const })),
    ]);
    setMessage({ tone: 'info', text: 'נוצרו 4 גרסאות התחלתיות. ערכו ואשרו כל אחת בנפרד — רק גרסאות מאושרות מתפרסמות.' });
  }

  async function persist(status: PostInput['status'] = post.status): Promise<string> {
    const saved = await savePost({ ...post, status, id: savedId });
    const savedVariants = await saveVariants(
      saved.id,
      variants.map((v) => ({ id: v.id, label: v.label, text: v.text, language: v.language, approval: v.approval })),
    );
    setVariants(savedVariants.map((x) => ({ ...x, key: x.id })));
    setSavedId(saved.id);
    setPost((p) => ({ ...p, status }));
    if (!postId) window.history.replaceState(null, '', `/social/posts/${saved.id}`);
    return saved.id;
  }

  async function onSave() {
    setBusy('save');
    try {
      await persist();
      setMessage({ tone: 'success', text: 'הפוסט נשמר.' });
    } catch (err) {
      setMessage({ tone: 'error', text: friendlyMessage(err, 'השמירה נכשלה.') });
    } finally {
      setBusy(null);
    }
  }

  function validateForPublish(): string | null {
    if (!post.base_text.trim() && !variants.some((v) => v.approval === 'approved' && v.text.trim()) && !post.media.length)
      return 'הפוסט ריק — כתבו טקסט או הוסיפו מדיה.';
    if (variants.length && approvedCount === 0) return 'יש גרסאות אך אף אחת לא אושרה. אשרו לפחות גרסה אחת (או מחקו את כולן כדי לפרסם את הטקסט הבסיסי).';
    if (!selectedTargets.length) return 'בחרו לפחות יעד אחד.';
    const groupCount = selectedTargets.filter((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group').length;
    /*
     * "מצב בדיקה", not "TEST MODE".
     *
     * The setting's on-screen name in הגדרות is "מצב בדיקה", on the third tab.
     * Four places in the product told the owner that "TEST MODE" was on and to
     * turn it off in settings — a name that appears nowhere on the settings
     * screen. It ships ON (DEFAULT_BROWSER.testMode), capping every publish at
     * one group, so turning it off is the literal first thing a new customer
     * has to do, and they were sent looking for a label that does not exist.
     * The path is now spelled out.
     */
    if (browser.testMode && groupCount > 1) return `מצב בדיקה פעיל — אפשר לבחור קבוצה אחת בלבד. כדי לכבות: ${TEST_MODE_PATH}.`;
    if (schedule.mode === 'once' && (!schedule.date || !schedule.time)) return 'בחרו תאריך ושעה.';
    if (schedule.mode === 'weekly' && !Object.values(schedule.weekly).some((t) => t.length)) return 'בחרו לפחות יום ושעה אחת.';
    if (schedule.mode === 'interval' && (!schedule.date || !schedule.intervalDays)) return 'הגדירו תאריך התחלה ותדירות.';
    if (schedule.mode === 'drip' && schedule.dripStart >= schedule.dripEnd) return 'חלון השעות של ההפצה לא תקין.';
    return null;
  }

  /** Nothing is written until the review sheet is confirmed. */
  function openReview() {
    if (!selectedTargets.length) {
      toast('בחרו לפחות יעד אחד.', 'error');
      document.getElementById('post-targets')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const problem = validateForPublish();
    if (problem) {
      setMessage({ tone: 'error', text: problem });
      toast(problem, 'error');
      return;
    }
    setReviewOpen(true);
  }

  async function onSchedule() {
    const problem = validateForPublish();
    if (problem) {
      toast(problem, 'error');
      return;
    }
    setBusy('schedule');
    try {
      const id = await persist('ready');
      const pending = await hasPendingQueue(id);
      if (pending > 0) {
        // A second round on a post that is still going out is almost always a
        // double-tap rather than an intention.
        // The count can come from queue rows or from a launch that has not been
        // materialised yet, so the wording has to hold for both.
        const again = await confirm.ask({
          title: 'הפוסט הזה כבר בדרך החוצה',
          body:
            pending === 1
              ? 'פרסום אחד של הפוסט הזה כבר ממתין ויֵצא לבד. להוסיף סבב נוסף על גביו?'
              : `${pending} פרסומים של הפוסט הזה כבר ממתינים ויצאו לבד. להוסיף סבב נוסף על גביהם?`,
          confirmLabel: 'הוסף סבב',
          cancelLabel: 'לא, השאר כמו שהוא',
        });
        if (!again) {
          setBusy(null);
          setReviewOpen(false);
          return;
        }
      }
      // Attach this launch to a run, so it shows up under "סבבי פרסום" with a
      // pause, a stop and a progress bar - the same thing quick publish does.
      await ensureRunForPost({ id, title: post.title, campaign_id: post.campaign_id });
      await createSchedule({
        ...scheduleDraftToInput(schedule, id, selectedTargets),
        variant_strategy: variantStrategy,
        variant_map: variantMap,
        require_confirmation: requireConfirmation || browser.testMode,
      });
      setStarted(true);
      setReviewOpen(false);
      if (schedule.mode === 'now' || schedule.mode === 'drip') {
        const r = await callSocialApi<{ ran: boolean; planned: number; reason?: string; published: number; manual: number; skipped: number; failed: number; deferred: number }>('/api/social/run');
        if (r.ran) {
          toast('הסבב התחיל. עקבו אחרי ההתקדמות למטה.');
          setMessage({
            tone: 'success',
            text: `דפים: ${r.published} ${agree(r.published, 'פורסם', 'פורסמו')}, ${r.skipped} ${agree(r.skipped, 'דולג', 'דולגו')}, ${r.deferred} ${agree(r.deferred, 'נדחה', 'נדחו')}, ${r.failed} ${agree(r.failed, 'נכשל', 'נכשלו')}. קבוצות מתפרסמות דרך התוכנה שעל המחשב שלכם — ההתקדמות למטה.`,
          });
        } else {
          // The queue was still built (planning runs even when publishing is
          // held), so say what is waiting and what releases it — not just why
          // nothing came out.
          const queued = r.planned ? `${counted(r.planned, 'פרסום אחד נכנס', 'פרסומים נכנסו', 'שני פרסומים נכנסו')} לתור. ` : '';
          toast(`${queued}הפרסום עצמו מושהה: ${r.reason}`, 'info');
          setMessage({ tone: 'info', text: `${queued}הפרסום עצמו לא רץ — ${r.reason}. לחצו "המשך" בראש הדף כדי לשחרר את התור.` });
        }
      } else {
        toast('התזמון נשמר.');
        setMessage({ tone: 'success', text: 'התזמון נשמר. הפרסומים ייכנסו לתור אוטומטית ויופיעו בלוח הבקרה.' });
      }
      setSchedules(await listSchedules(id));
    } catch (err) {
      toast(friendlyMessage(err, 'התזמון נכשל.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function onArchive() {
    if (!savedId) return;
    const ok = await confirm.ask({
      title: 'להעביר את הפוסט לארכיון?',
      body: 'תזמונים פעילים יבוטלו ופרסומים שטרם יצאו ידולגו. מה שכבר פורסם נשאר בהיסטוריה.',
      confirmLabel: 'העבר לארכיון',
      danger: true,
    });
    if (!ok) return;
    await archivePost(savedId);
    toast('הפוסט הועבר לארכיון.');
    // The content library is the list this post lived in (SocialShell's nav
    // entry moved there); /social/posts is still a working route but no longer
    // reachable from the navigation, so landing on it is a one-way street.
    router.push('/social/library');
  }

  if (loading) {
    return (
      <SocialShell title="פוסט">
        <Loading />
      </SocialShell>
    );
  }

  return (
    <SocialShell
      title={postId ? post.title || 'עריכת פוסט' : 'פוסט חדש'}
      headerAction={
        <Button variant="secondary" busy={busy === 'save'} onClick={onSave}>
          שמור
        </Button>
      }
    >
      {message && <div className="mb-4"><Notice tone={message.tone}>{message.text}</Notice></div>}

      {/* min-w-0 on both tracks: a grid item defaults to min-width:auto, so any
          horizontally-scrolling child (the filter rows) would stretch the whole
          page instead of scrolling inside itself. */}
      <div className="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <div className="min-w-0 space-y-5">
          <Card title="תוכן הפוסט">
            {/* No run picker: a run is created for the post on its first launch
                and reused after that (library.ts quickPublish). Choosing a
                container before you may publish is the step the owner called
                confusing, and it is not a decision the post needs. */}
            <Field label="שם פנימי" hint="לזיהוי בלוח הבקרה, לא מתפרסם">
              <input className={inputClass} value={post.title} onChange={(e) => update('title', e.target.value)} placeholder="למשל: ניקוי ספות באר שבע — ספטמבר" />
            </Field>
            <div className="mt-4">
              <Field label="טקסט בסיסי" hint="הטקסט שיתפרסם כשאין גרסאות. הטלפון וקישור ה-WhatsApp מצורפים אוטומטית בסוף.">
                <textarea className={`${inputClass} min-h-36`} value={post.base_text} onChange={(e) => update('base_text', e.target.value)} dir="auto" />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="שפה">
                <select className={inputClass} value={post.language} onChange={(e) => update('language', e.target.value as Language)}>
                  <option value="he">עברית</option>
                  <option value="ru">Русский</option>
                </select>
              </Field>
              <Field label="קישור" hint="כרטיס קישור וכפתור CTA מופיעים רק בפוסט ללא תמונות">
                <input className={inputClass} dir="ltr" value={post.link_url} onChange={(e) => update('link_url', e.target.value)} placeholder="https://" />
              </Field>
              <Field label="כפתור (CTA)">
                <select className={inputClass} value={post.cta_type} onChange={(e) => update('cta_type', e.target.value as CtaType)}>
                  {CTA_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="טלפון">
                <input className={inputClass} dir="ltr" value={post.phone} onChange={(e) => update('phone', e.target.value)} />
              </Field>
              <Field label="קישור WhatsApp" hint="wa.me — נבנה אוטומטית מהטלפון בהגדרות">
                <input className={inputClass} dir="ltr" value={post.whatsapp_url} onChange={(e) => update('whatsapp_url', e.target.value)} />
              </Field>
            </div>
            <div className="mt-4">
              <p className="mb-1 text-sm font-bold text-mist-300">תמונות / סרטון</p>
              <MediaUploader media={post.media as MediaItem[]} onChange={(m) => update('media', m)} />
            </div>
          </Card>

          <Card
            title={`גרסאות (${approvedCount}/${variants.length} מאושרות)`}
            action={
              <div className="flex gap-2">
                <Button variant="ghost" onClick={generate}>
                  <SparklesIcon className="h-4 w-4" /> צור 4 גרסאות
                </Button>
                <Button variant="secondary" onClick={() => addVariant()}>
                  + גרסה
                </Button>
              </div>
            }
          >
            {variants.length === 0 ? (
              <p className="text-sm text-mist-500">
                בלי גרסאות מתפרסם הטקסט הבסיסי. עם גרסאות, המערכת מסובבת ביניהן (A→B→C→D) כך שאותו נוסח לא חוזר ברצף — ורק גרסה שאישרתם ידנית יוצאת החוצה.
              </p>
            ) : (
              <ul className="space-y-3">
                {variants.map((v) => (
                  <li key={v.key} className={`rounded-xl border p-3 ${v.approval === 'approved' ? 'border-success-400/30 bg-success-400/12' : v.approval === 'rejected' ? 'border-error-300/30 opacity-60' : 'border-ink-700'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label="שם הגרסה"
                        className="w-40 min-h-11 rounded-xl border border-ink-600 bg-ink-900 px-2.5 py-1 text-base font-bold text-mist-100"
                        value={v.label}
                        onChange={(e) => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, label: e.target.value } : x)))}
                      />
                      <select
                        aria-label={`שפת הגרסה ${v.label}`}
                        className="min-h-11 rounded-xl border border-ink-600 bg-ink-900 px-2.5 py-1 text-base text-mist-100"
                        value={v.language}
                        onChange={(e) => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, language: e.target.value as Language } : x)))}
                      >
                        <option value="he">עברית</option>
                        <option value="ru">Русский</option>
                      </select>
                      <span className="grow" />
                      <button type="button" onClick={() => setPreviewKey(v.key)} className={`min-h-11 rounded-lg px-2.5 text-xs font-bold ${previewKey === v.key ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'}`}>
                        תצוגה מקדימה
                      </button>
                      <button
                        type="button"
                        onClick={() => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, approval: x.approval === 'approved' ? 'pending' : 'approved' } : x)))}
                        /* min-h-11, like "תצוגה מקדימה" on the same row: py-1
                           on text-xs measured 24px between two 44px siblings,
                           and approving a variant is the tap that decides what
                           goes out. */
                        className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-xs font-bold ${v.approval === 'approved' ? 'bg-success-500 text-on-state' : 'bg-ink-800 text-mist-300'}`}
                      >
                        <CheckIcon className="h-3.5 w-3.5" /> {v.approval === 'approved' ? 'מאושר' : 'אשר'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, approval: x.approval === 'rejected' ? 'pending' : 'rejected' } : x)))}
                        className="min-h-11 rounded-lg bg-ink-800 px-2.5 text-xs font-bold text-mist-300"
                      >
                        {v.approval === 'rejected' ? 'בטל דחייה' : 'דחה'}
                      </button>
                      <button type="button" aria-label="מחק גרסה" onClick={() => setVariants((all) => all.filter((x) => x.key !== v.key))} className="grid h-11 w-11 place-items-center rounded-lg text-error-400">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {/* No text-sm override: it beats inputClass's text-base and
                        measured 14px, and iOS Safari zooms the whole page on
                        focus for any control under 16. */}
                    <textarea
                      dir="auto"
                      aria-label={`טקסט הגרסה ${v.label}`}
                      className={`${inputClass} mt-2 min-h-24`}
                      value={v.text}
                      onChange={(e) => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, text: e.target.value } : x)))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            id="post-targets"
            title={`יעדי פרסום${selectedObjects.length ? ` · ${counted(selectedObjects.length, 'יעד אחד נבחר', 'יעדים נבחרו', 'שני יעדים נבחרו')}` : ''}`}
            action={
              <Link href="/social/groups" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
                ניהול קבוצות
              </Link>
            }
          >
            {targets.length > 0 && selectedObjects.length === 0 && (
              <div className="mb-3">
                <Notice tone="warn">בחרו לפחות יעד אחד — בלי זה אין לאן לפרסם.</Notice>
              </div>
            )}
            {targets.length === 0 ? (
              <Notice tone="warn">אין יעדים עדיין. חברו את פייסבוק במסך הדפים או הוסיפו קבוצות.</Notice>
            ) : (
              <TargetPicker
                targets={targets}
                selected={selectedTargets}
                onChange={setSelectedTargets}
                variants={variants
                  .filter((v) => v.id)
                  .map((v) => ({ id: v.id as string, post_id: savedId ?? '', label: v.label, text: v.text, language: v.language, approval: v.approval, sort: 0 }))}
                variantMap={variantMap}
                onVariantMap={setVariantMap}
                maxSelectable={browser.testMode ? 1 : undefined}
                note={browser.testMode ? `מצב בדיקה: קבוצה אחת בלבד, עם אישור ידני לפני הפרסום. כדי לכבות: ${TEST_MODE_PATH}.` : undefined}
              />
            )}
            {approvedCount > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-700 px-3 py-2.5">
                <span className="text-sm font-bold text-mist-100">חלוקת גרסאות:</span>
                <div role="group" className="flex rounded-xl bg-ink-800 p-0.5 text-xs font-bold">
                  {(
                    [
                      ['distribute', 'Distribute variants'],
                      ['rotate', 'סבב לכל יעד'],
                      ['fixed', 'רק הקצאה ידנית'],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} type="button" aria-pressed={variantStrategy === v} onClick={() => setVariantStrategy(v)} className={`min-h-11 rounded-lg px-2.5 ${variantStrategy === v ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-mist-500">
                  {variantStrategy === 'distribute' ? 'הגרסאות המאושרות מתחלקות בין היעדים (A ליעד הראשון, B לשני…).' : variantStrategy === 'rotate' ? 'כל יעד מקבל A, אחר כך B, C… בפרסומים הבאים.' : 'רק יעדים עם גרסה שנבחרה ידנית מקבלים גרסה; השאר — הטקסט הבסיסי.'}
                </span>
              </div>
            )}
            {selectedTargets.some((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group') && (
              <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-ink-700 px-3 py-2.5 text-sm text-mist-100">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-300" checked={requireConfirmation || browser.testMode} disabled={browser.testMode} onChange={(e) => setRequireConfirmation(e.target.checked)} />
                <span className="min-w-0">
                  <span className="font-bold">בקש אישור לפני כל פרסום</span>
                  <span className="block text-xs text-mist-500">התוכנה שבמחשב תעצור לפני הלחיצה האחרונה, תצלם מסך, ותחכה לאישור שלכם בלוח הבקרה.</span>
                </span>
              </label>
            )}
          </Card>

          <Card title="תזמון">
            {/* The interval the planner will space these by, so the preview above
                is the schedule and not a second opinion about it. */}
            <SchedulePicker
              value={schedule}
              onChange={setSchedule}
              targetCount={selectedObjects.length}
              targetNames={selectedObjects.map((t) => t.name)}
              spacingMinutes={spacingMinutes}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="lg" busy={busy === 'schedule'} onClick={openReview}>
                {selectedObjects.length === 0
                  ? 'בחרו יעדים כדי להתחיל'
                  : schedule.mode === 'now' || schedule.mode === 'drip'
                    ? `בדוק והתחל (${targetsLabel(selectedObjects.length)})`
                    : 'בדוק ושמור תזמון'}
              </Button>
              <Button variant="secondary" busy={busy === 'save'} onClick={onSave}>
                שמור כטיוטה
              </Button>
              {savedId && (
                <Button variant="ghost" onClick={onArchive} className="ms-auto text-error-400">
                  ארכיון
                </Button>
              )}
            </div>
            {schedules.some((s) => s.active) && (
              <ul className="mt-4 divide-y divide-ink-700 text-sm">
                {schedules.filter((s) => s.active).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-mist-100">
                      {describeSchedule(s)} · {targetsLabel(s.target_ids.length)}
                    </span>
                    <button type="button" className="min-h-11 px-2 text-xs font-bold text-error-400" onClick={() => setScheduleActive(s.id, false).then(() => listSchedules(s.post_id).then(setSchedules))}>
                      בטל תזמון
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* Drip schedules retire themselves once planned, so a busy post
                accumulates a wall of "לא פעיל" rows. They are history, not
                controls — one line, opened only if asked for. */}
            {schedules.some((s) => !s.active) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-mist-500">
                  תזמונים קודמים ({schedules.filter((s) => !s.active).length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-mist-500">
                  {schedules
                    .filter((s) => !s.active)
                    .map((s) => (
                      <li key={s.id}>
                        {describeSchedule(s)} · {targetsLabel(s.target_ids.length)}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Card>

          {(started || postId) && (
            <Card title="התקדמות הפרסום">
              <LiveBoard postId={savedId} compact />
            </Card>
          )}
        </div>

        <aside className="min-w-0 space-y-3 lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-mist-100">תצוגה מקדימה</h2>
            <select aria-label="גרסה לתצוגה מקדימה" className="min-h-11 rounded-xl border border-ink-600 bg-ink-900 px-2.5 py-1 text-base text-mist-100" value={previewKey} onChange={(e) => setPreviewKey(e.target.value)}>
              <option value="base">טקסט בסיסי</option>
              {variants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <PostPreview pageName={pageName} text={previewText} media={post.media as MediaItem[]} link={post.link_url} cta={post.cta_type} />
          <p className="text-xs text-mist-500">התצוגה משוערת; פייסבוק עשויה להציג תמונות וקישורים מעט אחרת.</p>
        </aside>
      </div>

      <PreLaunchReview
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onStart={onSchedule}
        busy={busy === 'schedule'}
        campaignName={campaign?.name ?? ''}
        // A post with no internal name still needs to be identifiable in the
        // review; its opening line is what the owner recognises.
        postTitle={post.title || post.base_text.split('\n')[0].slice(0, 60)}
        text={previewText}
        media={post.media as MediaItem[]}
        targets={selectedObjects}
        plan={plan}
        requireConfirmation={requireConfirmation || browser.testMode}
        warnings={[
          browser.testMode && selectedObjects.some((t) => t.channel === 'facebook_group')
            ? `מצב בדיקה פעיל: קבוצה אחת בלבד, עם אישור ידני לפני הפרסום. כדי לכבות: ${TEST_MODE_PATH}.`
            : '',
          approvedCount === 0 && variants.length > 0 ? 'אין גרסה מאושרת — יצא הטקסט הבסיסי.' : '',
          capWarning,
        ].filter(Boolean)}
      />
      {confirm.dialog}
    </SocialShell>
  );
}

function describeSchedule(s: Schedule): string {
  if (s.mode === 'now') return `פורסם מיד (${stampText(s.run_at)})`;
  if (s.mode === 'once') return `פעם אחת ב-${stampText(s.run_at)}`;
  if (s.mode === 'interval') return `כל ${s.interval_days} ימים ב-${s.interval_time} החל מ-${stampText(s.run_at)}`;
  if (s.mode === 'drip') return `הפצה הדרגתית: כל ${s.drip_gap_minutes ?? 20} דק׳${s.drip_per_day ? `, עד ${s.drip_per_day} ביום` : ''}, ${s.drip_window_start}–${s.drip_window_end}, מ-${stampText(s.run_at)}`;
  const days = Object.entries(s.weekly)
    .filter(([, t]) => t.length)
    .map(([d, t]) => `${['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][Number(d)]} ${t.join('/')}`)
    .join(', ');
  return `שבועי: ${days}`;
}
