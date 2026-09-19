'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CampaignCard } from '@/components/social/CampaignCard';
import { SocialShell } from '@/components/social/SocialShell';
import {
  Button,
  Card,
  ButtonLink,
  EmptyState,
  Field,
  Notice,
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
  listCampaigns,
  listPosts,
  pauseCampaign,
  reopenCampaign,
  saveCampaign,
} from '@/lib/social/client';
import { campaignState, type CampaignState } from '@/lib/social/campaign';
import { DEFAULT_BUSINESS, type BusinessSettings, type Campaign, type Post } from '@/lib/social/types';
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
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [editorOpen, setEditorOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('live');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [c, p, b, st] = await Promise.all([listCampaigns(), listPosts(), getBusiness(), campaignStates()]);
      setCampaigns(c);
      setPosts(p);
      setBusiness(b);
      setStates(st);
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

  const visible = useMemo(() => {
    const list = campaigns ?? [];
    if (filter === 'all') return list;
    const finished = (c: Campaign) => ['completed', 'stopped'].includes(stateOf(c).state);
    return filter === 'done' ? list.filter(finished) : list.filter((c) => !finished(c));
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    // Editing must never resurrect a stopped campaign, so status is only set
    // when the campaign is being created.
    const payload = form.id ? { ...form } : { ...form, status: 'active' as const };
    await act('save', () => saveCampaign(payload), 'הסבב עודכן.');
    setEditorOpen(false);
  }

  return (
    <SocialShell
      title="סבבי פרסום"
      lede="כל פרסום שהפעלתם — מה יצא, מה עוד יוצא, ומה אפשר לעצור"
      /* No "new run" action: a run is created by publishing a post, so the
         useful thing to offer here is the way back to the posts. */
      headerAction={<ButtonLink href="/social/library">ספריית תוכן</ButtonLink>}
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}

        <SegmentedControl
          label="סינון סבבי פרסום"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'live', label: 'פעילים', count: counts.live },
            { value: 'done', label: 'הסתיימו', count: counts.done },
            { value: 'all', label: 'הכל', count: counts.all },
          ]}
        />

        {!campaigns && (
          <Card>
            <SkeletonList rows={3} />
          </Card>
        )}

        {campaigns && visible.length === 0 && (
          <EmptyState
            icon={<MegaphoneIcon className="h-5 w-5" />}
            title={counts.all === 0 ? 'עדיין לא הפעלתם פרסום' : 'אין סבבי פרסום בסינון הזה'}
            description={
              counts.all === 0
                ? 'סבב הוא המסגרת שמאגדת פוסטים לפי שירות ועיר — למשל "ניקוי ספות באר שבע". אחר כך מוסיפים לו פוסט ובוחרים קבוצות.'
                : 'החליפו סינון כדי לראות את השאר.'
            }
            action={counts.all === 0 ? <ButtonLink href="/social/library">לספריית התוכן</ButtonLink> : undefined}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {visible.map((c) => {
            const state = stateOf(c);
            const mine = posts.filter((p) => p.campaign_id === c.id);
            return (
              <div key={c.id} className="space-y-1.5">
                <CampaignCard
                  campaign={c}
                  state={state}
                  busy={busy === `pause-${c.id}` || busy === `resume-${c.id}`}
                  onPause={() => act(`pause-${c.id}`, () => pauseCampaign(c.id, true), 'הסבב הושהה.')}
                  onResume={() => act(`resume-${c.id}`, () => pauseCampaign(c.id, false), 'הסבב ממשיך.')}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs font-bold">
                  <span className="text-mist-500">{mine.length} פוסטים</span>
                  <button type="button" className="min-h-11 px-1 text-brand-400" onClick={() => openEditor(c)}>
                    ערוך
                  </button>
                  <button type="button" className="min-h-11 px-1 text-brand-400" onClick={() => act(`dup-${c.id}`, () => duplicateCampaign(c.id), 'העתק נוצר.')}>
                    שכפל
                  </button>
                  {state.state === 'stopped' && (
                    <button type="button" className="text-brand-400" onClick={() => act(`open-${c.id}`, () => reopenCampaign(c.id), 'הסבב נפתח מחדש.')}>
                      פתח מחדש
                    </button>
                  )}
                  <Link href={`/social/posts/new?campaign=${c.id}`} className="text-brand-400">
                    + פוסט
                  </Link>
                  <button
                    type="button"
                    className="ms-auto text-error-400"
                    onClick={async () => {
                      const ok = await confirm.ask({
                        title: 'למחוק את הסבב?',
                        body: 'הפוסטים עצמם יישארו במערכת ללא שיוך לסבב. היסטוריית הפרסומים לא נמחקת.',
                        confirmLabel: 'מחק',
                        danger: true,
                      });
                      if (ok) await act(`del-${c.id}`, () => deleteCampaign(c.id), 'הסבב נמחק.');
                    }}
                  >
                    מחק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Sheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="עריכת סבב"
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
          <Field label="שם הסבב" hint="כך הוא יופיע בלוח הבקרה ובהיסטוריה">
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
