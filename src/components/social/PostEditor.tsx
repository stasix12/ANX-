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
import { SchedulePicker, planFor, type ScheduleDraft, scheduleDraftToInput } from '@/components/social/SchedulePicker';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Field, Loading, Notice, inputClass, useConfirm, useToast } from '@/components/social/ui';
import {
  archivePost,
  callSocialApi,
  createSchedule,
  getBrowserSettings,
  getBusiness,
  getPost,
  hasPendingQueue,
  listCampaigns,
  listSchedules,
  listTargets,
  listVariants,
  savePost,
  saveVariants,
  setScheduleActive,
  type PostInput,
} from '@/lib/social/client';
import { generateVariantSeeds, renderPostText, whatsappUrlFor } from '@/lib/social/compose';
import { formatDateTimeHe } from '@/lib/social/time';
import {
  CTA_OPTIONS,
  DEFAULT_BROWSER,
  DEFAULT_BUSINESS,
  type BrowserSettings,
  type BusinessSettings,
  type Campaign,
  type CtaType,
  type Language,
  type MediaItem,
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
export function PostEditor({ postId }: { postId?: string }) {
  const router = useRouter();
  const [post, setPost] = useState<PostInput>(emptyPost);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [targets, setTargets] = useState<SocialTarget[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);
  const [browser, setBrowser] = useState<BrowserSettings>(DEFAULT_BROWSER);
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
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    if (loadedFor.current === postId) return;
    loadedFor.current = postId;
    const [c, t, b, br] = await Promise.all([listCampaigns(), listTargets(), getBusiness(), getBrowserSettings()]);
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
    const defaultPages = t.filter((x) => x.enabled && x.channel === 'facebook_page').map((x) => x.id);
    setSelectedTargets((prev) => {
      if (prev.length) return prev;
      if (presetTargets.length) return presetTargets;
      if (lastTargets.length) return lastTargets;
      return defaultPages;
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
  const plan = useMemo(() => planFor(schedule, selectedObjects.length), [schedule, selectedObjects.length]);
  const previewVariant = variants.find((v) => v.key === previewKey) ?? null;
  const previewText = useMemo(() => renderPostText(post, previewVariant), [post, previewVariant]);
  const approvedCount = variants.filter((v) => v.approval === 'approved').length;
  const pageName = targets.find((t) => t.channel === 'facebook_page')?.name || business.name;

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
    if (browser.testMode && groupCount > 1) return 'TEST MODE פעיל — אפשר לבחור קבוצה אחת בלבד. כבו אותו בהגדרות אחרי שהבדיקה הראשונה עברה.';
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
          body: `${pending} פרסומים של הפוסט הזה כבר ממתינים ויצאו לבד. להוסיף סבב נוסף על גביהם?`,
          confirmLabel: 'הוסף סבב',
          cancelLabel: 'לא, השאר כמו שהוא',
        });
        if (!again) {
          setBusy(null);
          setReviewOpen(false);
          return;
        }
      }
      await createSchedule({
        ...scheduleDraftToInput(schedule, id, selectedTargets),
        variant_strategy: variantStrategy,
        variant_map: variantMap,
        require_confirmation: requireConfirmation || browser.testMode,
      });
      setStarted(true);
      setReviewOpen(false);
      if (schedule.mode === 'now' || schedule.mode === 'drip') {
        const r = await callSocialApi<{ ran: boolean; reason?: string; published: number; manual: number; skipped: number; failed: number; deferred: number }>('/api/social/run');
        if (r.ran) {
          toast('הקמפיין התחיל. עקבו אחרי ההתקדמות למטה.');
          setMessage({
            tone: 'success',
            text: `דפים: ${r.published} פורסמו, ${r.skipped} דולגו, ${r.deferred} נדחו, ${r.failed} נכשלו. קבוצות מתפרסמות דרך ה-worker המקומי — ההתקדמות למטה.`,
          });
        } else {
          toast(`נכנס לתור אך לא פורסם: ${r.reason}`, 'info');
          setMessage({ tone: 'info', text: `הפוסט נכנס לתור אך לא פורסם: ${r.reason}` });
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
    router.push('/social/posts');
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
            <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="שם פנימי" hint="לזיהוי בלוח הבקרה, לא מתפרסם">
                <input className={inputClass} value={post.title} onChange={(e) => update('title', e.target.value)} placeholder="למשל: ניקוי ספות באר שבע — ספטמבר" />
              </Field>
              <Field label="קמפיין">
                <select className={inputClass} value={post.campaign_id ?? ''} onChange={(e) => update('campaign_id', e.target.value || null)}>
                  <option value="">ללא קמפיין</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
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
                  <li key={v.key} className={`rounded-xl border p-3 ${v.approval === 'approved' ? 'border-emerald-300 bg-emerald-50/40' : v.approval === 'rejected' ? 'border-rose-200 opacity-60' : 'border-ink-600'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label="שם הגרסה"
                        className="w-40 rounded-lg border border-ink-600 bg-ink-850 px-2 py-1 text-sm font-bold text-mist-100"
                        value={v.label}
                        onChange={(e) => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, label: e.target.value } : x)))}
                      />
                      <select
                        aria-label={`שפת הגרסה ${v.label}`}
                        className="rounded-lg border border-ink-600 bg-ink-850 px-2 py-1 text-sm text-mist-100"
                        value={v.language}
                        onChange={(e) => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, language: e.target.value as Language } : x)))}
                      >
                        <option value="he">עברית</option>
                        <option value="ru">Русский</option>
                      </select>
                      <span className="grow" />
                      <button type="button" onClick={() => setPreviewKey(v.key)} className={`min-h-10 rounded-lg px-2.5 text-xs font-bold ${previewKey === v.key ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'}`}>
                        תצוגה מקדימה
                      </button>
                      <button
                        type="button"
                        onClick={() => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, approval: x.approval === 'approved' ? 'pending' : 'approved' } : x)))}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${v.approval === 'approved' ? 'bg-emerald-600 text-white' : 'bg-ink-800 text-mist-300'}`}
                      >
                        <CheckIcon className="h-3.5 w-3.5" /> {v.approval === 'approved' ? 'מאושר' : 'אשר'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVariants((all) => all.map((x) => (x.key === v.key ? { ...x, approval: x.approval === 'rejected' ? 'pending' : 'rejected' } : x)))}
                        className="rounded-lg bg-ink-800 px-2.5 py-1 text-xs font-bold text-mist-300"
                      >
                        {v.approval === 'rejected' ? 'בטל דחייה' : 'דחה'}
                      </button>
                      <button type="button" aria-label="מחק גרסה" onClick={() => setVariants((all) => all.filter((x) => x.key !== v.key))} className="grid h-10 w-10 place-items-center rounded-lg text-rose-600">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea
                      dir="auto"
                      aria-label={`טקסט הגרסה ${v.label}`}
                      className={`${inputClass} mt-2 min-h-24 text-sm`}
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
            title={`יעדי פרסום${selectedObjects.length ? ` · ${selectedObjects.length} נבחרו` : ''}`}
            action={
              <Link href="/social/groups" className="text-sm font-bold text-brand-400">
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
                note={browser.testMode ? 'TEST MODE: קבוצה אחת בלבד, עם אישור ידני לפני הפרסום. אפשר לכבות בהגדרות.' : undefined}
              />
            )}
            {approvedCount > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 px-3 py-2.5">
                <span className="text-sm font-bold text-mist-100">חלוקת גרסאות:</span>
                <div role="group" className="flex rounded-xl bg-ink-800 p-0.5 text-xs font-bold">
                  {(
                    [
                      ['distribute', 'Distribute variants'],
                      ['rotate', 'סבב לכל יעד'],
                      ['fixed', 'רק הקצאה ידנית'],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} type="button" aria-pressed={variantStrategy === v} onClick={() => setVariantStrategy(v)} className={`min-h-10 rounded-lg px-2.5 ${variantStrategy === v ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
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
              <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-ink-600 px-3 py-2.5 text-sm text-mist-100">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500" checked={requireConfirmation || browser.testMode} disabled={browser.testMode} onChange={(e) => setRequireConfirmation(e.target.checked)} />
                <span className="min-w-0">
                  <span className="font-bold">בקש אישור לפני כל פרסום</span>
                  <span className="block text-xs text-mist-500">ה-worker יעצור לפני הלחיצה האחרונה, יצלם מסך, ויחכה לאישור שלכם בלוח הבקרה.</span>
                </span>
              </label>
            )}
          </Card>

          <Card title="תזמון">
            <SchedulePicker value={schedule} onChange={setSchedule} targetCount={selectedObjects.length} targetNames={selectedObjects.map((t) => t.name)} />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="lg" busy={busy === 'schedule'} onClick={openReview}>
                {selectedObjects.length === 0
                  ? 'בחרו יעדים כדי להתחיל'
                  : schedule.mode === 'now' || schedule.mode === 'drip'
                    ? `בדוק והתחל (${selectedObjects.length} יעדים)`
                    : 'בדוק ושמור תזמון'}
              </Button>
              <Button variant="secondary" busy={busy === 'save'} onClick={onSave}>
                שמור כטיוטה
              </Button>
              {savedId && (
                <Button variant="ghost" onClick={onArchive} className="ms-auto text-rose-600">
                  ארכיון
                </Button>
              )}
            </div>
            {schedules.some((s) => s.active) && (
              <ul className="mt-4 divide-y divide-ink-700 text-sm">
                {schedules.filter((s) => s.active).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-mist-100">
                      {describeSchedule(s)} · {s.target_ids.length} יעדים
                    </span>
                    <button type="button" className="min-h-10 px-2 text-xs font-bold text-rose-600" onClick={() => setScheduleActive(s.id, false).then(() => listSchedules(s.post_id).then(setSchedules))}>
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
                        {describeSchedule(s)} · {s.target_ids.length} יעדים
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
            <select aria-label="גרסה לתצוגה מקדימה" className="rounded-lg border border-ink-600 bg-ink-850 px-2 py-1 text-sm text-mist-100" value={previewKey} onChange={(e) => setPreviewKey(e.target.value)}>
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
            ? 'TEST MODE פעיל: קבוצה אחת בלבד, עם אישור ידני לפני הפרסום. אפשר לכבות בהגדרות.'
            : '',
          approvedCount === 0 && variants.length > 0 ? 'אין גרסה מאושרת — יצא הטקסט הבסיסי.' : '',
        ].filter(Boolean)}
      />
      {confirm.dialog}
    </SocialShell>
  );
}

function describeSchedule(s: Schedule): string {
  if (s.mode === 'now') return `פורסם מיד (${formatDateTimeHe(s.run_at)})`;
  if (s.mode === 'once') return `פעם אחת ב-${formatDateTimeHe(s.run_at)}`;
  if (s.mode === 'interval') return `כל ${s.interval_days} ימים ב-${s.interval_time} החל מ-${formatDateTimeHe(s.run_at)}`;
  if (s.mode === 'drip') return `הפצה הדרגתית: כל ${s.drip_gap_minutes ?? 20} דק׳${s.drip_per_day ? `, עד ${s.drip_per_day} ביום` : ''}, ${s.drip_window_start}–${s.drip_window_end}, מ-${formatDateTimeHe(s.run_at)}`;
  const days = Object.entries(s.weekly)
    .filter(([, t]) => t.length)
    .map(([d, t]) => `${['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][Number(d)]} ${t.join('/')}`)
    .join(', ');
  return `שבועי: ${days}`;
}
