'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GroupCard } from '@/components/social/GroupCard';
import { SocialShell } from '@/components/social/SocialShell';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import {
  Badge,
  CARD_ELEVATED,
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  SegmentedControl,
  Sheet,
  SkeletonList,
  Toggle,
  inputClass,
  useConfirm,
  useToast,
  ButtonLink,
} from '@/components/social/ui';
import {
  addGroup,
  bulkDeleteTargets,
  bulkUpdateTargets,
  listQueue,
  listTargets,
  listWorkers,
  requestGroupRefresh,
  updateTarget,
} from '@/lib/social/client';
import { formatDayMonthHe } from '@/lib/social/time';
import { detectCity, sortCities } from '@/lib/social/cities';
import { parseGroupUrl, type SocialTarget } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { SearchIcon, UsersIcon } from '@/components/icons';

type StatusFilter = 'all' | 'active' | 'paused' | 'favorites' | 'recent';
type View = 'grid' | 'list';

const RECENT_DAYS = 14;
/*
 * How many group cards are put on the page at once. Each card carries an
 * avatar, badges and its own menu — roughly 25 elements — so rendering a
 * thousand of them at once is tens of thousands of nodes and a visibly slow
 * screen. Filtering and bulk selection still work across the whole list; only
 * the drawing is incremental.
 */
const CHUNK = 60;

/**
 * /social/groups — the Facebook Groups the owner may post in, built for
 * hundreds of them: one search box, three filter rows, and a selection bar
 * that turns "37 groups in Be'er Sheva" into one tap.
 *
 * Each group is published by the local browser worker — there is no Meta API
 * for group posting since April 2024 — and the screen says so rather than
 * implying an official integration.
 */
export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<SocialTarget[] | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [view, setView] = useState<View>('grid');
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [nextByTarget, setNextByTarget] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ url: '', name: '' });
  const [bulk, setBulk] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [shown, setShown] = useState(CHUNK);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const [t, w, queued] = await Promise.all([
      listTargets(),
      listWorkers().catch(() => []),
      listQueue({ status: ['scheduled'], limit: 500 }).catch(() => []),
    ]);
    setGroups(t.filter((x) => x.channel === 'facebook_group' || x.channel === 'facebook_group_manual'));
    setWorkerOnline(w.some((x) => x.online));
    const next: Record<string, string> = {};
    for (const row of [...queued].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
      if (!next[row.target_id]) next[row.target_id] = row.scheduled_at;
    }
    setNextByTarget(next);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(friendlyMessage(err, 'טעינה נכשלה.')));
  }, [load]);

  const cityOf = useCallback((g: SocialTarget) => g.city || detectCity(g.name), []);
  const all = useMemo(() => groups ?? [], [groups]);

  const recentCutoff = useMemo(() => new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString(), []);

  const matchesStatus = useCallback(
    (g: SocialTarget) => {
      if (status === 'active') return g.enabled;
      if (status === 'paused') return !g.enabled;
      if (status === 'favorites') return Boolean(g.favorite);
      if (status === 'recent') return Boolean(g.last_published_at && g.last_published_at > recentCutoff);
      return true;
    },
    [status, recentCutoff],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (g) =>
        matchesStatus(g) &&
        (!cityFilter || cityOf(g) === cityFilter) &&
        (!categoryFilter || (g.category || '') === categoryFilter) &&
        (!q || g.name.toLowerCase().includes(q) || g.url.toLowerCase().includes(q) || (g.category ?? '').toLowerCase().includes(q)),
    );
  }, [all, query, matchesStatus, cityFilter, categoryFilter, cityOf]);

  const cities = useMemo(() => sortCities(all.map(cityOf)), [all, cityOf]);
  const categories = useMemo(() => Array.from(new Set(all.map((g) => g.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'he')), [all]);
  /* Only this slice is drawn; `visible` remains the real filtered set. */
  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);

  /* A new filter means a new list, so start from the top again. */
  useEffect(() => {
    setShown(CHUNK);
  }, [query, cityFilter, categoryFilter, status]);

  const sections = useMemo(
    () =>
      cities
        .map((c) => {
          const inCity = visible.filter((g) => cityOf(g) === c);
          // items = what is drawn, ids = every match in this city, so the
          // "select all" here is not limited to what happens to be on screen.
          return { city: c, items: page.filter((g) => cityOf(g) === c), total: inCity.length, ids: inCity.map((g) => g.id) };
        })
        .filter((s) => s.items.length),
    [cities, page, visible, cityOf],
  );

  const statusCounts = useMemo(
    () => ({
      all: all.length,
      active: all.filter((g) => g.enabled).length,
      paused: all.filter((g) => !g.enabled).length,
      favorites: all.filter((g) => g.favorite).length,
      recent: all.filter((g) => g.last_published_at && g.last_published_at > recentCutoff).length,
    }),
    [all, recentCutoff],
  );

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  const parsed = parseGroupUrl(form.url);
  const toggleSelect = (id: string, on: boolean) => setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));

  function menuFor(g: SocialTarget) {
    return [
      { label: 'פתח את הקבוצה בפייסבוק', icon: '↗', onSelect: () => window.open(g.url, '_blank', 'noreferrer') },
      { label: 'פרופיל והיסטוריה', icon: '📊', onSelect: () => router.push(`/social/groups/${g.id}`) },
      { label: 'צור פוסט לקבוצה הזו', icon: '📝', onSelect: () => router.push(`/social/posts/new?targets=${g.id}`) },
      { label: g.favorite ? 'הסר מהמועדפות' : 'הוסף למועדפות', icon: g.favorite ? '☆' : '⭐', onSelect: () => act(`fav-${g.id}`, () => updateTarget(g.id, { favorite: !g.favorite })) },
      { label: g.enabled ? 'השהה קבוצה' : 'הפעל קבוצה', icon: g.enabled ? '⏸' : '▶', onSelect: () => act(`on-${g.id}`, () => updateTarget(g.id, { enabled: !g.enabled }), g.enabled ? 'הקבוצה הושהתה.' : 'הקבוצה הופעלה.') },
      { label: 'רענן שם ותמונה', icon: '🔄', onSelect: () => act(`sync-${g.id}`, () => requestGroupRefresh([g.id]), 'ה-worker ימשוך מחדש כשיהיה פנוי.') },
      {
        label: 'הסר מהרשימה',
        icon: '🗑',
        danger: true,
        onSelect: async () => {
          const ok = await confirm.ask({
            title: `להסיר את "${g.name}"?`,
            body: 'הקבוצה תוסר מרשימת היעדים. היסטוריית הפרסומים אליה נשמרת.',
            confirmLabel: 'הסר',
            danger: true,
          });
          if (ok) await act(`del-${g.id}`, () => bulkDeleteTargets([g.id]), 'הקבוצה הוסרה.');
        },
      },
    ];
  }

  return (
    <SocialShell
      title="קבוצות"
      lede="היעדים שאליהם המערכת מפרסמת"
      headerAction={
        <Button onClick={() => setAddOpen(true)}>
          + הוסף
        </Button>
      }
    >
      <div className="space-y-4 pb-20">
        {error && <Notice tone="error">{error}</Notice>}
        {workerOnline === false && (
          <Notice tone="warn">
            ה-worker המקומי לא רץ. קבוצות מתפרסמות רק כשהוא פועל על המחשב שלכם: <code dir="ltr">npm run social-worker</code>
          </Notice>
        )}

        {/* Search + the three filter dimensions. */}
        <Card padded={false} className="p-3">
          <input
            className={inputClass}
            placeholder="חיפוש קבוצה…"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="חיפוש קבוצה"
          />
          <div className="mt-2.5 min-w-0 space-y-2 overflow-x-auto scrollbar-none">
            <SegmentedControl
              size="sm"
              label="סטטוס"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'הכל', count: statusCounts.all },
                { value: 'active', label: 'פעילות', count: statusCounts.active },
                { value: 'favorites', label: '⭐', count: statusCounts.favorites },
                { value: 'recent', label: 'פורסם לאחרונה', count: statusCounts.recent },
                { value: 'paused', label: 'מושהות', count: statusCounts.paused },
              ]}
              className="min-w-max"
            />
            <SegmentedControl
              size="sm"
              label="עיר"
              value={cityFilter}
              onChange={setCityFilter}
              options={[{ value: '', label: 'כל הערים' }, ...cities.map((c) => ({ value: c, label: c, count: all.filter((g) => cityOf(g) === c).length }))]}
              className="min-w-max"
            />
            {categories.length > 0 && (
              <SegmentedControl
                size="sm"
                label="קטגוריה"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[{ value: '', label: 'כל הקטגוריות' }, ...categories.map((c) => ({ value: c, label: c, count: all.filter((g) => g.category === c).length }))]}
                className="min-w-max"
              />
            )}
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex gap-3 text-xs font-bold">
              <button type="button" className="min-h-11 px-1 text-brand-400" onClick={() => setSelected(visible.map((g) => g.id))}>
                בחר את כל {visible.length} המוצגות
              </button>
              {selected.length > 0 && (
                <button type="button" className="min-h-11 px-1 text-mist-500" onClick={() => setSelected([])}>
                  נקה
                </button>
              )}
            </div>
            <SegmentedControl
              size="sm"
              label="תצוגה"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: 'משבצות' },
                { value: 'list', label: 'רשימה' },
              ]}
            />
          </div>
        </Card>

        {groups === null && (
          <Card>
            <SkeletonList rows={5} />
          </Card>
        )}

        {groups && all.length === 0 && (
          <EmptyState
            icon={<UsersIcon className="h-5 w-5" />}
            title="אין עדיין קבוצות"
            description="הדביקו קישור לקבוצת פייסבוק שאתם חברים בה ומותר לכם לפרסם בה. אפשר גם להדביק עשרות קישורים בבת אחת."
            action={<Button onClick={() => setAddOpen(true)}>הוסף קבוצה ראשונה</Button>}
          />
        )}

        {groups && all.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={<SearchIcon className="h-5 w-5" />}
            title="אין קבוצות שמתאימות לסינון"
            description="נסו לנקות את החיפוש או לבחור 'הכל'."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setStatus('all');
                  setCityFilter('');
                  setCategoryFilter('');
                }}
              >
                נקה סינון
              </Button>
            }
          />
        )}

        {visible.length > 0 && view === 'grid' && (
          <div className="space-y-5">
            {sections.map((section) => {
              const ids = section.ids;
              const allOn = ids.every((id) => selected.includes(id));
              return (
                <section key={section.city}>
                  <header className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-base font-extrabold text-mist-100">
                      {section.city} <span className="text-sm font-semibold text-mist-500">({section.total})</span>
                    </h3>
                    <button
                      type="button"
                      className="min-h-11 text-xs font-bold text-brand-400"
                      onClick={() => setSelected((s) => (allOn ? s.filter((id) => !ids.includes(id)) : [...new Set([...s, ...ids])]))}
                    >
                      {allOn ? 'בטל בחירה' : `בחר את כל ${section.total}`}
                    </button>
                  </header>
                  <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 [&>*]:min-w-0">
                    {section.items.map((g) => (
                      <GroupCard
                        key={g.id}
                        group={g}
                        selected={selected.includes(g.id)}
                        onSelect={(on) => toggleSelect(g.id, on)}
                        onToggleFavorite={() => act(`fav-${g.id}`, () => updateTarget(g.id, { favorite: !g.favorite }))}
                        actions={menuFor(g)}
                        nextAt={nextByTarget[g.id]}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {visible.length > 0 && view === 'list' && (
          <Card padded={false}>
            <ul className="divide-y divide-ink-700">
              {page.map((g) => (
                <li key={g.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`בחר את ${g.name}`}
                    checked={selected.includes(g.id)}
                    onChange={(e) => toggleSelect(g.id, e.target.checked)}
                    className="h-5 w-5 shrink-0 accent-brand-300"
                  />
                  <Link href={`/social/groups/${g.id}`} className="flex min-w-0 grow items-center gap-2.5">
                    <TargetAvatar name={g.name} imageUrl={g.image_url} channel={g.channel} size={40} />
                    <div className="min-w-0">
                      <p dir="auto" className={`truncate text-sm font-bold ${g.enabled ? 'text-mist-100' : 'text-mist-500'}`}>
                        {g.favorite && <span aria-hidden>⭐ </span>}
                        {g.name}
                      </p>
                      <p dir="auto" className="truncate text-[11px] text-mist-500">
                        {cityOf(g)}
                        {g.category ? ` · ${g.category}` : ''} · {g.last_published_at ? `פורסם ${formatDayMonthHe(g.last_published_at)}` : 'טרם פורסם'}
                      </p>
                    </div>
                  </Link>
                  <Toggle checked={g.enabled} onChange={(v) => act(`on-${g.id}`, () => updateTarget(g.id, { enabled: v }))} label={`הפעל את ${g.name}`} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* The rest of the matches are one tap away. The count is of the real
            filtered set, so it says how many are actually left. */}
        {visible.length > page.length && (
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <Button variant="secondary" onClick={() => setShown((n) => n + CHUNK)}>
              הצג עוד {Math.min(CHUNK, visible.length - page.length)}
            </Button>
            <p className="text-[11px] text-mist-500">
              מוצגות {page.length} מתוך {visible.length}. הסינון והבחירה עובדים על כולן.
            </p>
          </div>
        )}
      </div>

      {/* This bar wraps to three rows on a phone and floats inside the clearance
          the page reserves for the tab bar, so the last few group rows sat under
          it with no way to scroll clear. The spacer is its height, and it is
          present only while the bar is. */}
      {selected.length > 0 && <div aria-hidden className="h-40 sm:h-24" />}

      {/* Selection bar: sticky above the tab bar, so it is reachable with a thumb.
          data-overlay keeps the page's entrance animation off it — that animation
          sets a transform, and a transformed element is the containing block for
          anything positioned fixed inside it. */}
      {selected.length > 0 && (
        <div data-overlay className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4">
          <div className={`mx-auto flex max-w-3xl flex-wrap items-center gap-2 p-2.5 ${CARD_ELEVATED}`}>
            <Badge tone="brand">נבחרו {selected.length}</Badge>
            <ButtonLink href={`/social/posts/new?targets=${selected.join(',')}`} size="sm">צור פוסט</ButtonLink>
            <Button size="sm" variant="secondary" busy={busy === 'bulk-on'} onClick={() => act('bulk-on', () => bulkUpdateTargets(selected, { enabled: true }), 'הופעלו.')}>
              הפעל
            </Button>
            <Button size="sm" variant="secondary" busy={busy === 'bulk-off'} onClick={() => act('bulk-off', () => bulkUpdateTargets(selected, { enabled: false }), 'הושהו.')}>
              השהה
            </Button>
            <Button size="sm" variant="secondary" busy={busy === 'bulk-fav'} onClick={() => act('bulk-fav', () => bulkUpdateTargets(selected, { favorite: true }), 'סומנו כמועדפות.')}>
              ⭐
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setCategoryDraft(''); setCategoryOpen(true); }}>
              קטגוריה
            </Button>
            <Button
              size="sm"
              variant="danger"
              busy={busy === 'bulk-del'}
              onClick={async () => {
                const ok = await confirm.ask({
                  title: `להסיר ${selected.length} קבוצות?`,
                  body: 'הן יוסרו מרשימת היעדים. היסטוריית הפרסומים נשמרת.',
                  confirmLabel: 'הסר',
                  danger: true,
                });
                if (ok) await act('bulk-del', () => bulkDeleteTargets(selected).then(() => setSelected([])), 'הוסרו.');
              }}
            >
              הסר
            </Button>
            <button type="button" className="ms-auto min-h-11 px-3 text-xs font-bold text-mist-500" onClick={() => setSelected([])}>
              בטל
            </button>
          </div>
        </div>
      )}

      {/* Category assignment for the whole selection. */}
      <Sheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={`קטגוריה ל-${selected.length} קבוצות`}
        footer={
          <Button
            size="lg"
            className="w-full"
            busy={busy === 'bulk-cat'}
            onClick={() => {
              setCategoryOpen(false);
              act('bulk-cat', () => bulkUpdateTargets(selected, { category: categoryDraft.trim() }), categoryDraft.trim() ? `סווגו כ-"${categoryDraft.trim()}".` : 'הקטגוריה נוקתה.');
            }}
          >
            שמור
          </Button>
        }
      >
        <Field label="שם הקטגוריה" hint="למשל: לוחות מכירה, קהילתי, יד שנייה. השאירו ריק כדי לנקות.">
          <input className={inputClass} value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value)} list="group-categories" />
          <datalist id="group-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCategoryDraft(c)} className="min-h-11 rounded-full bg-ink-800 px-3 text-xs font-bold text-mist-300">
                {c}
              </button>
            ))}
          </div>
        )}
      </Sheet>

      {/* Adding groups: one link, or a whole list pasted at once. */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="הוספת קבוצות" size="lg">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!parsed) {
              toast('כתובת לא תקינה — צריך קישור בסגנון facebook.com/groups/…', 'error');
              return;
            }
            act('add', () => addGroup(form).then(() => setForm({ url: '', name: '' })), 'הקבוצה נוספה. השם והתמונה יימשכו מפייסבוק אוטומטית.');
          }}
        >
          <Field label="קישור לקבוצה" hint={parsed ? `זוהה: ${parsed.externalId}` : 'facebook.com/groups/…'}>
            <input className={inputClass} dir="ltr" inputMode="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.facebook.com/groups/…" />
          </Field>
          <Field label="שם (רשות)">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="באר שבע ביחד" />
          </Field>
          <Button type="submit" size="lg" className="w-full" busy={busy === 'add'} disabled={!parsed}>
            הוסף קבוצה
          </Button>
        </form>

        <div className="mt-5 border-t border-ink-700 pt-4">
          <p className="mb-2 text-sm font-extrabold text-mist-100">הוספה של הרבה קבוצות</p>
          {/* No text-sm: it beats inputClass's text-base (Tailwind orders
              .text-sm after .text-base, so className order does not decide it)
              and lands the box at 14px, which is what makes iOS Safari zoom the
              whole page the moment this is tapped. font-mono is the part that
              was wanted here; the 16px floor stays. */}
          <textarea
            className={`${inputClass} min-h-32 font-mono`}
            dir="ltr"
            placeholder={'קישור בכל שורה:\nhttps://www.facebook.com/groups/…\nhttps://www.facebook.com/groups/…'}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <Button
            className="mt-2 w-full"
            size="lg"
            busy={busy === 'bulk'}
            onClick={() =>
              act('bulk', async () => {
                const lines = bulk.split(/\s+/).map((l) => l.trim()).filter(Boolean);
                let added = 0;
                const failed: string[] = [];
                for (const line of lines) {
                  try {
                    await addGroup({ url: line });
                    added += 1;
                  } catch {
                    failed.push(line);
                  }
                }
                // Whatever failed stays in the box so it can be fixed and retried.
                setBulk(failed.join('\n'));
                toast(`נוספו ${added} קבוצות${failed.length ? `; ${failed.length} לא נוספו ונשארו בתיבה` : ''}.`, failed.length ? 'info' : 'success');
              })
            }
          >
            הוסף את כולן
          </Button>
          <p className="mt-2 text-xs text-mist-500">
            הוסיפו רק קבוצות שאתם חברים בהן ומותר לכם לפרסם בהן. הפרסום נעשה מהחשבון שלכם דרך הדפדפן שעל המחשב — לא דרך API רשמי של פייסבוק.
          </p>
        </div>
      </Sheet>

      {confirm.dialog}
    </SocialShell>
  );
}
