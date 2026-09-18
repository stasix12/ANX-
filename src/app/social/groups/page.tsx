'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Button, Card, Empty, Field, Loading, Notice, Toggle, inputClass } from '@/components/social/ui';
import { addGroup, bulkDeleteTargets, bulkUpdateTargets, listQueue, listTargets, listWorkers, requestGroupRefresh, updateTarget } from '@/lib/social/client';
import { formatDateTimeHe } from '@/lib/social/time';
import { KNOWN_CITIES, OTHER_CITY, detectCity, sortCities } from '@/lib/social/cities';
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
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [nextByTarget, setNextByTarget] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ url: '', name: '' });
  const [bulk, setBulk] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, w, queued] = await Promise.all([
      listTargets(),
      listWorkers().catch(() => []),
      listQueue({ status: ['scheduled'], limit: 300 }).catch(() => []),
    ]);
    setGroups(t.filter((x) => x.channel === 'facebook_group' || x.channel === 'facebook_group_manual'));
    setWorkerOnline(w.some((x) => x.online));
    // Soonest scheduled publication per group, for the "next publication" line.
    const next: Record<string, string> = {};
    for (const row of [...queued].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
      if (!next[row.target_id]) next[row.target_id] = row.scheduled_at;
    }
    setNextByTarget(next);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'טעינה נכשלה.'));
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups ?? []).filter(
      (g) =>
        (!activeOnly || g.enabled) &&
        (!favoritesOnly || g.favorite) &&
        (!cityFilter || (g.city || detectCity(g.name)) === cityFilter) &&
        (!q || g.name.toLowerCase().includes(q) || g.url.toLowerCase().includes(q)),
    );
  }, [groups, query, activeOnly, cityFilter, favoritesOnly]);

  const cityOf = (g: SocialTarget) => g.city || detectCity(g.name);
  const cities = useMemo(() => sortCities((groups ?? []).map(cityOf)), [groups]);
  const sections = useMemo(() => cities.map((c) => ({ city: c, items: visible.filter((g) => cityOf(g) === c) })).filter((s) => s.items.length), [cities, visible]);
  const cityOptions = sortCities(Array.from(new Set([...KNOWN_CITIES, ...cities, OTHER_CITY])));

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

        {/* Collapsed by default: with 100+ groups the list is what people
            came for, and on a phone the form filled the entire first screen. */}
        <details className="group" open={addOpen} onToggle={(e) => setAddOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="mb-3 flex cursor-pointer list-none items-center justify-between rounded-card border border-ink-600 bg-ink-850 px-4 py-3 text-sm font-extrabold text-mist-100">
            <span>+ הוספת קבוצה</span>
            <span aria-hidden className="text-mist-500 transition-transform group-open:rotate-180">⌄</span>
          </summary>
        <Card>
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
              <p className="text-xs text-mist-500">השם והתמונה של כל קבוצה נמשכים מפייסבוק אוטומטית תוך דקות (ה-worker צריך לרוץ).</p>
            </div>
          </details>
        </Card>
        </details>

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
              <span className="text-mist-500">·</span>
              <button type="button" aria-pressed={favoritesOnly} className={favoritesOnly ? 'text-amber-600' : 'text-brand-400'} onClick={() => setFavoritesOnly((v) => !v)}>
                ⭐ מועדפות {favoritesOnly ? '✓' : ''}
              </button>
            </div>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className={`${inputClass} !w-auto grow`} placeholder="חיפוש לפי שם…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div role="group" className="flex flex-wrap gap-1 rounded-xl bg-ink-800 p-0.5 text-xs font-bold">
              <button type="button" aria-pressed={!cityFilter} onClick={() => setCityFilter('')} className={`rounded-lg px-2.5 py-1.5 ${!cityFilter ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
                כל הערים
              </button>
              {cities.map((c) => (
                <button key={c} type="button" aria-pressed={cityFilter === c} onClick={() => setCityFilter(c)} className={`rounded-lg px-2.5 py-1.5 ${cityFilter === c ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
                  {c} ({(groups ?? []).filter((g) => cityOf(g) === c).length})
                </button>
              ))}
            </div>
            <div role="group" className="flex rounded-xl bg-ink-800 p-0.5 text-xs font-bold">
              <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={`rounded-lg px-2.5 py-1.5 ${view === 'grid' ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
                משבצות
              </button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`rounded-lg px-2.5 py-1.5 ${view === 'list' ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
                רשימה
              </button>
            </div>
            <Button variant="secondary" busy={busy === 'refresh'} onClick={() => act('refresh', () => requestGroupRefresh(selected.length ? selected : undefined), 'ה-worker ימשוך שם ותמונה מחדש כשהוא פנוי.')}>
              רענן שם ותמונה{selected.length ? ` (${selected.length})` : ''}
            </Button>
            {selected.length > 0 && (
              <>
                <Button variant="secondary" busy={busy === 'on'} onClick={() => act('on', () => bulkUpdateTargets(selected, { enabled: true }))}>
                  הפעל ({selected.length})
                </Button>
                <Button variant="secondary" busy={busy === 'off'} onClick={() => act('off', () => bulkUpdateTargets(selected, { enabled: false }))}>
                  כבה
                </Button>
                <Button variant="secondary" busy={busy === 'fav'} onClick={() => act('fav', () => bulkUpdateTargets(selected, { favorite: true }))}>
                  ⭐ למועדפות
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
          {visible.length > 0 && view === 'grid' && (
            <div className="space-y-5">
              {sections.map((section) => {
                const ids = section.items.map((g) => g.id);
                const allOn = ids.every((id) => selected.includes(id));
                return (
                  <section key={section.city}>
                    <header className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-base font-extrabold text-mist-100">
                        {section.city} <span className="text-sm font-semibold text-mist-500">({section.items.length})</span>
                      </h3>
                      <button
                        type="button"
                        className="text-xs font-bold text-brand-400"
                        onClick={() => setSelected((s) => (allOn ? s.filter((id) => !ids.includes(id)) : Array.from(new Set([...s, ...ids]))))}
                      >
                        {allOn ? 'בטל בחירה במקטע' : 'בחר את כל המקטע'}
                      </button>
                    </header>
                    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {section.items.map((g) => {
                        const checked = selected.includes(g.id);
                        return (
                          <li
                            key={g.id}
                            className={`relative flex flex-col items-center rounded-2xl border p-3 text-center transition-colors ${checked ? 'border-brand-500 bg-brand-500/5' : 'border-ink-600'} ${g.enabled ? '' : 'opacity-50'}`}
                          >
                            <input
                              type="checkbox"
                              aria-label={`בחר ${g.name}`}
                              checked={checked}
                              onChange={(e) => setSelected((s) => (e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id)))}
                              className="absolute end-2 top-2 h-4 w-4 accent-brand-500"
                            />
                            {/* Status dot and the star share one row at the
                                top so neither collides with the city select. */}
                            <div className="absolute start-2 top-2 flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => act(g.id, () => updateTarget(g.id, { enabled: !g.enabled }))}
                                title={g.enabled ? 'פעיל — לחצו לכיבוי' : 'כבוי — לחצו להפעלה'}
                                aria-label={g.enabled ? `כבה את ${g.name}` : `הפעל את ${g.name}`}
                              >
                                <span className={`block h-2.5 w-2.5 rounded-full ${g.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              </button>
                              <button
                                type="button"
                                className="text-sm leading-none"
                                aria-label={g.favorite ? `הסר את ${g.name} מהמועדפות` : `הוסף את ${g.name} למועדפות`}
                                onClick={() => act(`fav-${g.id}`, () => updateTarget(g.id, { favorite: !g.favorite }))}
                              >
                                {g.favorite ? '⭐' : '☆'}
                              </button>
                            </div>
                            <a href={g.url} target="_blank" rel="noreferrer" className="mt-2">
                              <TargetAvatar name={g.name} imageUrl={g.image_url} channel={g.channel} size={84} />
                            </a>
                            <p className="mt-2 line-clamp-2 w-full text-sm font-bold leading-tight text-mist-100" title={g.name}>
                              {g.name}
                            </p>
                            <p className="mt-1 text-[11px] text-mist-500">
                              {!g.last_synced_at ? 'מושך פרטים…' : g.last_published_at ? `פורסם ${formatDateTimeHe(g.last_published_at).slice(0, 10)}` : 'טרם פורסם'}
                            </p>
                            {nextByTarget[g.id] && (
                              <p className="text-[11px] font-semibold text-sky-700">הבא: {formatDateTimeHe(nextByTarget[g.id]).slice(0, 16)}</p>
                            )}
                            {g.last_status && g.last_status !== 'published' && <p className="text-[11px] text-rose-700">{STATUS_LABEL[g.last_status] ?? g.last_status}</p>}
                            <select
                              aria-label={`עיר של ${g.name}`}
                              value={cityOf(g)}
                              onChange={(e) => act(`city-${g.id}`, () => updateTarget(g.id, { city: e.target.value }))}
                              className="mt-1.5 w-full rounded-lg border border-ink-600 bg-ink-850 px-1 py-0.5 text-[11px] text-mist-300"
                            >
                              {cityOptions.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
          {visible.length > 0 && view === 'list' && (
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
                        <div className="flex items-center gap-2.5">
                          <TargetAvatar name={g.name} imageUrl={g.image_url} channel={g.channel} size={56} />
                          <div className="min-w-0">
                            <a href={g.url} target="_blank" rel="noreferrer" className="font-bold text-mist-100 hover:text-brand-400">
                              {g.name}
                            </a>
                            {!g.last_synced_at && <p className="text-xs text-mist-500">ממתין למשיכת שם ותמונה מפייסבוק…</p>}
                            {g.last_error && <p className="max-w-xs truncate text-xs text-rose-700" title={g.last_error}>{g.last_error}</p>}
                          </div>
                        </div>
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
