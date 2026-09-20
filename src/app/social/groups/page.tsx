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
  ErrorState,
  Field,
  Notice,
  OverflowMenu,
  SegmentedControl,
  Sheet,
  SkeletonList,
  Toggle,
  inputClass,
  useConfirm,
  useToast,
  ButtonLink,
  type MenuAction,
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
import { ChartIcon, CloseIcon, PauseIcon, PencilIcon, PlayIcon, RepeatIcon, SearchIcon, StarIcon, TagIcon, TrashIcon, UsersIcon } from '@/components/icons';

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
 * The one sentence every "remove a group" confirmation uses.
 *
 * It was written out three times (single, bulk, and the group profile) and the
 * three copies all made the same false promise. One constant so a correction
 * lands everywhere at once — the same reason status.ts exists.
 */
const DELETE_GROUP_WARNING =
  'הסרה מוחקת גם את כל היסטוריית הפרסומים לקבוצה הזו — כולל מה שכבר פורסם בהצלחה — ולכן המספרים ב"פורסמו היום", בהיסטוריה ובסבבי הפרסום ירדו בהתאם. אי אפשר לבטל. אם רק לא רוצים לפרסם אליה יותר, עדיף "השהה קבוצה".';

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
  /*
   * Selection is a mode, not an always-on affordance.
   *
   * Every card used to carry a checkbox whether or not anyone was selecting,
   * which is what put a dark puck on 125 group pictures. Browsing and picking
   * are now two states of one screen: `picking` decides whether the cards are
   * links or toggles, whether the list rows show a checkbox, and whether the
   * floating action bar exists at all. Leaving the mode drops the selection —
   * a selection you cannot see is a selection you will act on by accident.
   */
  const [picking, setPicking] = useState(false);
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

  /* One entry point for the first read and for the retry button, so a failed
     load is never a dead end: the banner carries the way out of it. */
  const reload = useCallback(() => {
    setError(null);
    load().catch((err) => setError(friendlyMessage(err, 'טעינה נכשלה.')));
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const exitPicking = useCallback(() => {
    setPicking(false);
    setSelected([]);
  }, []);

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

  /*
   * The overflow menu, in ONE visual language.
   *
   * Opened on a phone it was seven rows in three: a hairline ↗, a full-colour
   * 📊, a full-colour 📝, a hairline ☆, a tiny ⏸, a green 🔄 and a red 🗑 —
   * the emoji optically larger and heavier than the glyphs beside them, in
   * Apple's colours rather than the product's tokens. Every one of these had
   * an SVG equivalent sitting unused in icons.tsx.
   */
  const mk = 'h-4.5 w-4.5';

  function menuFor(g: SocialTarget) {
    return [
      { label: 'פתח את הקבוצה בפייסבוק', icon: <UsersIcon className={mk} />, onSelect: () => window.open(g.url, '_blank', 'noreferrer') },
      { label: 'פרופיל והיסטוריה', icon: <ChartIcon className={mk} />, onSelect: () => router.push(`/social/groups/${g.id}`) },
      { label: 'צור פוסט לקבוצה הזו', icon: <PencilIcon className={mk} />, onSelect: () => router.push(`/social/posts/new?targets=${g.id}`) },
      { label: g.favorite ? 'הסר מהמועדפות' : 'הוסף למועדפות', icon: <StarIcon className={mk} />, onSelect: () => act(`fav-${g.id}`, () => updateTarget(g.id, { favorite: !g.favorite })) },
      { label: g.enabled ? 'השהה קבוצה' : 'הפעל קבוצה', icon: g.enabled ? <PauseIcon className={mk} /> : <PlayIcon className={mk} />, onSelect: () => act(`on-${g.id}`, () => updateTarget(g.id, { enabled: !g.enabled }), g.enabled ? 'הקבוצה הושהתה.' : 'הקבוצה הופעלה.') },
      { label: 'רענן שם ותמונה', icon: <RepeatIcon className={mk} />, onSelect: () => act(`sync-${g.id}`, () => requestGroupRefresh([g.id]), 'התוכנה במחשב תמשוך מחדש כשתהיה פנויה.') },
      {
        label: 'הסר מהרשימה',
        icon: <TrashIcon className={mk} />,
        danger: true,
        onSelect: async () => {
          /*
           * This dialog used to say the opposite of what happens.
           *
           * "היסטוריית הפרסומים אליה נשמרת" — the publication history is kept.
           * It is not: social_queue.target_id is `on delete cascade`
           * (social-schema.sql:184) and the delete is a plain DELETE, so every
           * queue row for the group is destroyed, PUBLISHED rows included. An
           * owner tidying ten dead groups watched "פורסמו היום", the history
           * and every campaign total silently drop, with no undo and a
           * confirmation that had promised it could not happen.
           *
           * The wording below states the real cost and points at the action
           * that does what the owner usually meant.
           */
          const ok = await confirm.ask({
            title: `להסיר את "${g.name}"?`,
            body: DELETE_GROUP_WARNING,
            confirmLabel: 'הסר ומחק היסטוריה',
            danger: true,
          });
          if (ok) await act(`del-${g.id}`, () => bulkDeleteTargets([g.id]), 'הקבוצה הוסרה.');
        },
      },
    ];
  }

  /* Hebrew has no bare-numeral singular, so `${n} קבוצות` reads "1 קבוצות" —
     and 1 is the commonest value here. */
  const selectionLabel =
    selected.length === 0 ? 'לא נבחרו קבוצות' : selected.length === 1 ? 'נבחרה קבוצה אחת' : `נבחרו ${selected.length} קבוצות`;

  const bulkActions: MenuAction[] = [
    {
      label: `בחר את כל ${visible.length} התואמות`,
      icon: <UsersIcon className={mk} />,
      onSelect: () => setSelected(visible.map((g) => g.id)),
    },
    { label: 'נקה בחירה', icon: <CloseIcon className={mk} />, disabled: selected.length === 0, onSelect: () => setSelected([]) },
    { label: 'הפעל', icon: <PlayIcon className={mk} />, disabled: selected.length === 0, onSelect: () => act('bulk-on', () => bulkUpdateTargets(selected, { enabled: true }), 'הופעלו.') },
    { label: 'השהה', icon: <PauseIcon className={mk} />, disabled: selected.length === 0, onSelect: () => act('bulk-off', () => bulkUpdateTargets(selected, { enabled: false }), 'הושהו.') },
    { label: 'סמן כמועדפות', icon: <StarIcon className={mk} />, disabled: selected.length === 0, onSelect: () => act('bulk-fav', () => bulkUpdateTargets(selected, { favorite: true }), 'סומנו כמועדפות.') },
    { label: 'שייך לקטגוריה', icon: <TagIcon className={mk} />, disabled: selected.length === 0, onSelect: () => { setCategoryDraft(''); setCategoryOpen(true); } },
    {
      label: 'הסר מהרשימה',
      icon: <TrashIcon className={mk} />,
      danger: true,
      disabled: selected.length === 0,
      onSelect: async () => {
        const ok = await confirm.ask({
          title: selected.length === 1 ? 'להסיר קבוצה אחת?' : `להסיר ${selected.length} קבוצות?`,
          body: DELETE_GROUP_WARNING,
          confirmLabel: 'הסר ומחק היסטוריה',
          danger: true,
        });
        if (ok) await act('bulk-del', () => bulkDeleteTargets(selected).then(() => setSelected([])), 'הוסרו.');
      },
    },
  ];

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
      {/* No pb-* here: the shell already reserves the tab bar's height plus the
          safe-area inset, and the selection bar has its own conditional
          spacer below. The 80px this used to add on top of both was half a
          card row of nothing on the screen the owner calls cramped. */}
      <div className="space-y-4">
        {error && <ErrorState message={error} onRetry={reload} />}
        {workerOnline === false && (
          <Notice tone="warn">
            {/* This used to end in `npm run social-worker` — a terminal command
                handed to a cleaning-business owner on a phone. The file below
                is the one they were given, and it is what the rest of the
                product already tells them to double-click. */}
            התוכנה שמפרסמת לקבוצות לא רצה כרגע, ולכן שום פרסום לקבוצה לא ייצא. במחשב שבו מותקנת המערכת, לחצו פעמיים על{' '}
            <code dir="ltr">start-worker.cmd</code> והשאירו את החלון פתוח.
          </Notice>
        )}

        {/*
          Search + the filter dimensions, at about half the height they cost
          before.

          The input itself is untouched on purpose: min-h-11 is the tap floor
          and its text-base is what stops iOS Safari zooming the whole page
          when it is focused, so "slightly shorter" is bought from the card
          around it (p-3 → px-3 py-2.5) and from the rows below, not from the
          field. The three chip rows used to be `track` SegmentedControls —
          48px each, wrapping to 96 when a city list was long — sharing ONE
          horizontal scroller, so dragging the status chips dragged the city
          chips with them. Each is now its own 44px `chips` row with its own
          scroll.
        */}
        <Card padded={false} className="px-3 py-2.5">
          <input
            className={inputClass}
            placeholder="חיפוש קבוצה…"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="חיפוש קבוצה"
          />
          <div className="mt-2 space-y-1.5">
            <SegmentedControl
              variant="chips"
              label="סטטוס"
              value={status}
              onChange={setStatus}
              /* Counts omitted, not zeroed, until the list is known — these
                 chips render above the skeleton, so offline the owner was
                 shown "הכל 0 · פעילות 0 · ⭐ 0" for a database holding 42
                 groups. And the favourites chip was labelled with a bare ⭐,
                 whose entire accessible name was the emoji: VoiceOver read
                 the filter out as "white medium star". */
              options={[
                { value: 'all', label: 'הכל', count: groups ? statusCounts.all : undefined },
                { value: 'active', label: 'פעילות', count: groups ? statusCounts.active : undefined },
                { value: 'favorites', label: 'מועדפות', count: groups ? statusCounts.favorites : undefined },
                { value: 'recent', label: 'פורסם לאחרונה', count: groups ? statusCounts.recent : undefined },
                { value: 'paused', label: 'מושהות', count: groups ? statusCounts.paused : undefined },
              ]}
            />
            <SegmentedControl
              variant="chips"
              label="עיר"
              value={cityFilter}
              onChange={setCityFilter}
              options={[{ value: '', label: 'כל הערים' }, ...cities.map((c) => ({ value: c, label: c, count: all.filter((g) => cityOf(g) === c).length }))]}
            />
            {categories.length > 0 && (
              <SegmentedControl
                variant="chips"
                label="קטגוריה"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[{ value: '', label: 'כל הקטגוריות' }, ...categories.map((c) => ({ value: c, label: c, count: all.filter((g) => g.category === c).length }))]}
              />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {/* The one door into selection mode, and the one door out of it.
                "בחר את כל …" used to live here and claimed to select what was
                "מוצגות" while selecting every match — it has moved into the
                selection bar's menu, where it is only reachable once picking
                has actually started, and it says what it does. */}
            <button
              type="button"
              aria-pressed={picking}
              onClick={() => (picking ? exitPicking() : setPicking(true))}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-xs font-bold transition-colors ${
                picking ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'
              }`}
            >
              {picking ? 'סיום בחירה' : 'בחר'}
            </button>
            <SegmentedControl
              variant="chips"
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

        {groups === null && !error && (
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
                    {/* The bracketed figure used to be every match in this city
                        while the grid under it held only the ones on the
                        current page — the owner counted 8 tiles under "(29)"
                        and had no way to tell which number was lying. It now
                        says both, and only when they differ. */}
                    <h3 className="text-base font-extrabold text-mist-100">
                      {section.city}{' '}
                      <span className="text-sm font-semibold text-mist-500">
                        ({section.items.length < section.total ? `${section.items.length} מתוך ${section.total}` : section.total})
                      </span>
                    </h3>
                    {picking && (
                      <button
                        type="button"
                        className="min-h-11 shrink-0 text-xs font-bold text-brand-400"
                        onClick={() => setSelected((s) => (allOn ? s.filter((id) => !ids.includes(id)) : [...new Set([...s, ...ids])]))}
                      >
                        {allOn ? 'בטל בחירה' : `בחר את כל ${section.total}`}
                      </button>
                    )}
                  </header>
                  <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 [&>*]:min-w-0">
                    {section.items.map((g) => (
                      <GroupCard
                        key={g.id}
                        group={g}
                        selectionMode={picking}
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
                  {/* The bare 20px input was the one control on this screen a
                      thumb genuinely missed; the label around it is the 44px
                      target every other checkbox in the module already has.
                      Like the card's, it exists only while picking. */}
                  {picking && (
                    <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center">
                      <input
                        type="checkbox"
                        aria-label={`בחר את ${g.name}`}
                        checked={selected.includes(g.id)}
                        onChange={(e) => toggleSelect(g.id, e.target.checked)}
                        className="h-5 w-5 accent-brand-300"
                      />
                    </label>
                  )}
                  <Link href={`/social/groups/${g.id}`} className="flex min-w-0 grow items-center gap-2.5">
                    <TargetAvatar name={g.name} imageUrl={g.image_url} channel={g.channel} size={40} />
                    <div className="min-w-0">
                      {/* line-clamp-2, matching the card: switching views used
                          to change how much of a group's name was readable. */}
                      <p dir="auto" className={`line-clamp-2 text-sm font-bold ${g.enabled ? 'text-mist-100' : 'text-mist-500'}`}>
                        {g.favorite && <StarIcon aria-hidden className="me-1 inline h-3.5 w-3.5 align-[-0.15em] text-warning-400" fill="currentColor" />}
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

      {/* The bar is 64px on one row now, so the spacer is one height instead of
          two guesses. It is present exactly while the bar is. */}
      {picking && <div aria-hidden className="h-24" />}

      {/* Selection bar: fixed above the tab bar, so it is reachable with a thumb.
          data-overlay keeps the page's entrance animation off it — that animation
          sets a transform, and a transformed element is the containing block for
          anything positioned fixed inside it.

          It used to carry eight controls in a flex-wrap row that collapsed to
          three lines on a phone and needed a 160px spacer under the list. One
          primary action and one way out stay on the bar; everything else — the
          two select-alls, enable, pause, favourite, category and the
          destructive remove, all of them still here — moved into the "⋯",
          which is the same sheet the cards use and gives every one of them a
          Hebrew name (the favourite action's whole accessible name used to be
          "⭐", read out as "white medium star"). */}
      {picking && (
        <div data-overlay className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4">
          <div className={`mx-auto flex max-w-3xl items-center gap-2 p-2.5 ${CARD_ELEVATED}`}>
            <Badge tone="brand">{selectionLabel}</Badge>
            {selected.length > 0 && <ButtonLink href={`/social/posts/new?targets=${selected.join(',')}`}>צור פוסט</ButtonLink>}
            <OverflowMenu label="פעולות על הבחירה" actions={bulkActions} />
            <button type="button" className="ms-auto min-h-11 shrink-0 px-3 text-xs font-bold text-mist-500" onClick={exitPicking}>
              בטל
            </button>
          </div>
        </div>
      )}

      {/* Category assignment for the whole selection. */}
      <Sheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        /* The same ל-/ל split the rest of this file already uses: "קטגוריה
           לקבוצה אחת", never "קטגוריה ל-1 קבוצות". */
        title={selected.length === 1 ? 'קטגוריה לקבוצה אחת' : `קטגוריה ל-${selected.length} קבוצות`}
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
