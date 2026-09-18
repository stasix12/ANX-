'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Empty, Field, Loading, Notice, Toggle, inputClass } from '@/components/social/ui';
import { addGroup, bulkDeleteTargets, bulkUpdateTargets, listTargets, listWorkers, updateTarget } from '@/lib/social/client';
import { formatDateTimeHe } from '@/lib/social/time';
import { parseGroupUrl, type SocialTarget } from '@/lib/social/types';

const STATUS_LABEL: Record<string, string> = {
  '': '—',
  published: '✅ פורסם',
  pending_approval: '🕓 ממתין לאישור מנהל',
  failed: '❌ נכשל',
  needs_attention: '⚠️ דורש טיפול',
  cannot_post: '🚫 אין הרשאת פרסום',
};

/**
 * /social/groups — the Facebook Groups the owner may post in. Each one is
 * published by the local browser worker; there is no Meta API for groups.
 */
export default function GroupsPage() {
  const [groups, setGroups] = useState<SocialTarget[] | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [form, setForm] = useState({ url: '', name: '' });
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, w] = await Promise.all([listTargets(), listWorkers().catch(() => [])]);
    setGroups(t.filter((x) => x.channel === 'facebook_group' || x.channel === 'facebook_group_manual'));
    setWorkerOnline(w.some((x) => x.online));
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'טעינה נכשלה.'));
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups ?? []).filter((g) => (!activeOnly || g.enabled) && (!q || g.name.toLowerCase().includes(q) || g.url.toLowerCase().includes(q)));
  }, [groups, query, activeOnly]);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (done) setFlash(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה.');
    } finally {
      setBusy(null);
    }
  }

  const parsed = parseGroupUrl(form.url);

  return (
    <SocialShell
      title="קבוצות פייסבוק"
      headerAction={
        selected.length > 0 ? (
          <Link href={`/social/posts/new?targets=${selected.join(',')}`} className="rounded-full bg-white px-3.5 py-2 text-sm font-bold text-blue-700 shadow-sm">
            פוסט ל-{selected.length} קבוצות ←
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {flash && <Notice tone="info">{flash}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {workerOnline === false && (
          <Notice tone="warn">
            ה-worker המקומי לא רץ כרגע. קבוצות מתפרסמות רק כשהוא פועל על המחשב שלכם: <code dir="ltr">npm run social-worker</code>. פרטים ב-docs/SOCIAL.md.
          </Notice>
        )}

        <Card title="הוספת קבוצה">
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!parsed) return setError('כתובת לא תקינה — צריך קישור בסגנון facebook.com/groups/…');
              act('add', () => addGroup(form).then(() => setForm({ url: '', name: '' })), 'הקבוצה נוספה. השם יתעדכן אוטומטית מהקבוצה בפרסום הראשון.');
            }}
          >
            <Field label="קישור לקבוצה" hint={parsed ? `זוהה: ${parsed.externalId}` : 'facebook.com/groups/…'}>
              <input className={inputClass} dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.facebook.com/groups/…" />
            </Field>
            <Field label="שם (רשות)">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="באר שבע ביחד" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" busy={busy === 'add'} disabled={!parsed}>
                הוסף
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-mist-500">הוסיפו רק קבוצות שאתם חברים בהן ומותר לכם לפרסם בהן. הפרסום נעשה מהחשבון שלכם, דרך הדפדפן, בקצב שמרני.</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-bold text-brand-400">הוספה של הרבה קבוצות בבת אחת</summary>
            <div className="mt-2 space-y-2">
              <textarea
                className={`${inputClass} min-h-32 font-mono text-sm`}
                dir="ltr"
                placeholder={'הדביקו קישור לקבוצה בכל שורה:\nhttps://www.facebook.com/groups/…\nhttps://www.facebook.com/groups/…'}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
              <Button
                busy={busy === 'bulk'}
                onClick={() =>
                  act(
                    'bulk',
                    async () => {
                      const lines = bulk.split(/\s+/).map((l) => l.trim()).filter(Boolean);
                      let added = 0;
                      const failed: string[] = [];
                      for (const line of lines) {
                        try {
                          await addGroup({ url: line });
                          added += 1;
                        } catch (err) {
                          failed.push(`${line} (${err instanceof Error ? err.message : 'שגיאה'})`);
                        }
                      }
                      setBulk(failed.map((f) => f.split(' (')[0]).join('\n'));
                      setFlash(`נוספו ${added} קבוצות.${failed.length ? ` ${failed.length} לא נוספו (נשארו בתיבה): ${failed.slice(0, 3).join('; ')}` : ''}`);
                    },
                  )
                }
              >
                הוסף את כולן
              </Button>
              <p className="text-xs text-mist-500">השם של כל קבוצה מתעדכן אוטומטית מפייסבוק בפרסום הראשון אליה.</p>
            </div>
          </details>
        </Card>

        <Card
          title={`הקבוצות שלי (${groups?.length ?? 0})`}
          action={
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <button type="button" className="text-brand-400" onClick={() => setSelected(visible.map((g) => g.id))}>
                בחר הכל
              </button>
              <span className="text-mist-500">·</span>
              <button type="button" className="text-brand-400" onClick={() => setSelected([])}>
                נקה בחירה
              </button>
              <span className="text-mist-500">·</span>
              <button type="button" aria-pressed={activeOnly} className={activeOnly ? 'text-emerald-700' : 'text-brand-400'} onClick={() => setActiveOnly((v) => !v)}>
                פעילות בלבד {activeOnly ? '✓' : ''}
              </button>
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className={`${inputClass} !w-auto grow`} placeholder="חיפוש לפי שם…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {selected.length > 0 && (
              <>
                <Button variant="secondary" busy={busy === 'on'} onClick={() => act('on', () => bulkUpdateTargets(selected, { enabled: true }))}>
                  הפעל ({selected.length})
                </Button>
                <Button variant="secondary" busy={busy === 'off'} onClick={() => act('off', () => bulkUpdateTargets(selected, { enabled: false }))}>
                  כבה
                </Button>
                <Button
                  variant="danger"
                  busy={busy === 'del'}
                  onClick={() => {
                    if (window.confirm(`למחוק ${selected.length} קבוצות?`)) act('del', () => bulkDeleteTargets(selected).then(() => setSelected([])));
                  }}
                >
                  מחק
                </Button>
              </>
            )}
          </div>
          {groups === null && <Loading />}
          {groups && visible.length === 0 && <Empty>אין קבוצות. הוסיפו קישור למעלה.</Empty>}
          {visible.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-mist-500">
                  <tr>
                    <th className="py-2" />
                    <th className="py-2 text-start font-bold">שם</th>
                    <th className="py-2 text-start font-bold">מזהה</th>
                    <th className="py-2 text-start font-bold">פרסום אחרון</th>
                    <th className="py-2 text-start font-bold">סטטוס אחרון</th>
                    <th className="py-2 text-start font-bold">פעיל</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {visible.map((g) => (
                    <tr key={g.id} className={g.enabled ? '' : 'opacity-60'}>
                      <td className="py-2.5 pe-2">
                        <input type="checkbox" aria-label={`בחר ${g.name}`} checked={selected.includes(g.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id)))} className="h-4 w-4 accent-brand-500" />
                      </td>
                      <td className="py-2.5 pe-3">
                        <a href={g.url} target="_blank" rel="noreferrer" className="font-bold text-mist-100 hover:text-brand-400">
                          {g.name}
                        </a>
                        {g.last_error && <p className="max-w-xs truncate text-xs text-rose-700" title={g.last_error}>{g.last_error}</p>}
                      </td>
                      <td className="py-2.5 pe-3 font-mono text-xs text-mist-300" dir="ltr">
                        {g.external_id || '—'}
                      </td>
                      <td className="py-2.5 pe-3 whitespace-nowrap text-mist-300">{g.last_published_at ? formatDateTimeHe(g.last_published_at) : '—'}</td>
                      <td className="py-2.5 pe-3 whitespace-nowrap">{STATUS_LABEL[g.last_status ?? ''] ?? g.last_status}</td>
                      <td className="py-2.5">
                        <Toggle checked={g.enabled} onChange={(v) => act(g.id, () => updateTarget(g.id, { enabled: v }))} label={`הפעל ${g.name}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </SocialShell>
  );
}
