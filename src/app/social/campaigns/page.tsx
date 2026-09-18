'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CampaignProgressBar } from '@/components/social/CampaignProgressBar';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Empty, Field, Loading, Notice, inputClass } from '@/components/social/ui';
import { campaignProgress, deleteCampaign, duplicateCampaign, getBusiness, listCampaigns, listPosts, pauseCampaign, saveCampaign, stopCampaign } from '@/lib/social/client';
import { DEFAULT_BUSINESS, EMPTY_PROGRESS, type BusinessSettings, type Campaign, type CampaignProgress, type Post } from '@/lib/social/types';

const blank = { name: '', service: '', city: '', language: 'he' as Campaign['language'], notes: '' };

/**
 * Campaign = a theme ("ניקוי ספות באר שבע") that groups posts, their
 * variants and images. The city/service feed the variant generator.
 */
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [progress, setProgress] = useState<Record<string, CampaignProgress>>({});
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [c, p, b, prog] = await Promise.all([listCampaigns(), listPosts(), getBusiness(), campaignProgress()]);
    setCampaigns(c);
    setPosts(p);
    setBusiness(b);
    setProgress(prog);
    setForm((f) => (f.id ? f : { ...f, service: f.service || b.services[0], city: f.city || b.cities[0] }));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'טעינה נכשלה.'));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await saveCampaign({ ...form, status: 'active' });
      setForm({ ...blank, service: business.services[0], city: business.cities[0] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  }

  const suggestName = () => setForm((f) => ({ ...f, name: f.name || `${f.service || 'ניקוי ספות'} ${f.city || ''}`.trim() }));

  return (
    <SocialShell title="קמפיינים">
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card title={form.id ? 'עריכת קמפיין' : 'קמפיין חדש'}>
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
              <input className={inputClass} list="cities" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <datalist id="cities">
                {business.cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="שם הקמפיין">
              <input className={inputClass} value={form.name} onFocus={suggestName} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ניקוי ספות באר שבע" />
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
            <div className="flex gap-2">
              <Button type="submit" busy={busy}>
                {form.id ? 'שמור' : 'צור קמפיין'}
              </Button>
              {form.id && (
                <Button variant="secondary" onClick={() => setForm({ ...blank, service: business.services[0], city: business.cities[0] })}>
                  ביטול
                </Button>
              )}
            </div>
          </form>
        </Card>

        <div className="space-y-3">
          {!campaigns && <Loading />}
          {campaigns && campaigns.length === 0 && <Empty>אין קמפיינים. צרו למשל "ניקוי ספות באר שבע".</Empty>}
          {campaigns?.map((c) => {
            const mine = posts.filter((p) => p.campaign_id === c.id);
            return (
              <Card key={c.id} title={c.name} action={<Link href={`/social/posts/new?campaign=${c.id}`} className="text-sm font-bold text-brand-400">+ פוסט</Link>}>
                <p className="text-sm text-mist-300">
                  {c.service} · {c.city} · {c.language === 'he' ? 'עברית' : c.language === 'ru' ? 'רוסית' : 'עברית + רוסית'} ·{' '}
                  <span className={c.status === 'active' ? 'text-emerald-700' : 'text-amber-700'}>{c.status === 'active' ? 'פעיל' : c.status === 'paused' ? 'מושהה' : 'בארכיון'}</span>
                </p>
                {c.notes && <p className="mt-1 text-sm text-mist-500">{c.notes}</p>}
                <div className="mt-3">
                  <CampaignProgressBar progress={progress[c.id] ?? EMPTY_PROGRESS} />
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {mine.length === 0 && <li className="text-mist-500">אין פוסטים בקמפיין הזה עדיין.</li>}
                  {mine.map((p) => (
                    <li key={p.id}>
                      <Link href={`/social/posts/${p.id}`} className="font-bold text-brand-400">
                        {p.title || p.base_text.slice(0, 50) || 'ללא כותרת'}
                      </Link>
                      <span className="text-mist-500"> · {p.status === 'ready' ? 'מוכן' : 'טיוטה'}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setForm({ id: c.id, name: c.name, service: c.service, city: c.city, language: c.language, notes: c.notes })}>
                    ערוך
                  </Button>
                  {c.status === 'active' ? (
                    <Button variant="secondary" onClick={() => pauseCampaign(c.id, true).then(load)}>
                      ⏸ Pause
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => pauseCampaign(c.id, false).then(load)}>
                      ▶ Resume
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm('לעצור את הקמפיין? כל הפרסומים שטרם התחילו יבוטלו.')) stopCampaign(c.id).then(load);
                    }}
                  >
                    ⏹ Stop
                  </Button>
                  <Button variant="ghost" onClick={() => duplicateCampaign(c.id).then(load)}>
                    ⧉ שכפל
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-rose-600"
                    onClick={() => {
                      if (window.confirm('למחוק את הקמפיין? הפוסטים יישארו ללא קמפיין.')) deleteCampaign(c.id).then(load);
                    }}
                  >
                    מחק
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </SocialShell>
  );
}
