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
  getBusiness,
  getLimits,
  listQueue,
  listTargets,
  listWorkers,
  requestGroupRefresh,
  updateTarget,
} from '@/lib/social/client';
import {
  AUDIENCE_SHORT,
  audienceOf,
  suggestForAll,
  type Audience,
} from '@/lib/social/audience';
import { formatDayMonthHe } from '@/lib/social/time';
import { KNOWN_CITIES, detectCity, sortCities } from '@/lib/social/cities';
import {
  DEFAULT_BUSINESS,
  DEFAULT_LIMITS,
  isPendingShare,
  parseGroupShareUrl,
  parseGroupUrl,
  type BusinessSettings,
  type LimitsSettings,
  type SocialTarget,
} from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { ChartIcon, CheckIcon, CloseIcon, MapPinIcon, PauseIcon, PencilIcon, PlayIcon, RepeatIcon, SearchIcon, SparklesIcon, StarIcon, TagIcon, TrashIcon, UsersIcon } from '@/components/icons';

type StatusFilter = 'all' | 'active' | 'paused' | 'favorites' | 'recent' | 'new';
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
  /*
   * Which groups the city sheet is about.
   *
   * One sheet, two doorways: a single group's "⋯" and the selection bar. It
   * holds IDS rather than a mode flag, so the sheet never has to ask which of
   * the two opened it — and a single group cannot be mistaken for the
   * selection that happens to be active behind it.
   */
  const [cityFor, setCityFor] = useState<string[] | null>(null);
  const [cityDraft, setCityDraft] = useState('');
  const [shown, setShown] = useState(CHUNK);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * WHO THE CUSTOMERS ARE — the owner's own mark per group, and the switch that
   * makes it bite. "שלא אשלח לקבוצות שאין שם לקוחות שלי."
   *
   * The settings are read here as well as enforced in the engine because this
   * screen has to be able to say what the mark COSTS: with the switch on, an
   * unmarked group receives nothing, and the only place that is discoverable is
   * the screen where the marking happens.
   */
  const [audience, setAudience] = useState<'all' | Audience>('all');
  const [limits, setLimits] = useState<LimitsSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);
  const [suggestOpen, setSuggestOpen] = useState(false);
  /** Which of the suggested marks the owner is still willing to apply. */
  const [suggestOff, setSuggestOff] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const [t, w, queued, lim, biz] = await Promise.all([
      listTargets(),
      listWorkers().catch(() => []),
      listQueue({ status: ['scheduled'], limit: 500 }).catch(() => []),
      getLimits().catch(() => DEFAULT_LIMITS),
      getBusiness().catch(() => DEFAULT_BUSINESS),
    ]);
    setLimits(lim);
    setBusiness(biz);
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
  /* Every city already in use, plus the ones detectCity knows — so a group in
     "אחר" can be given a real city without typing it. */
  const cityChoices = useMemo(
    () => sortCities(Array.from(new Set([...KNOWN_CITIES, ...all.map((g) => g.city).filter(Boolean) as string[]]))),
    [all],
  );


  const recentCutoff = useMemo(() => new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString(), []);
  /*
   * "Added in the last day" — about when the GROUP joined the list, not when
   * anything was published to it.
   *
   * The two are easy to confuse on this screen because "פורסם לאחרונה" sits
   * right beside it, and they answer opposite questions: one is "where has my
   * content been going", the other is "what did I just add and have not set up
   * yet". Adding twenty groups in an evening and then trying to find them
   * among a hundred and twenty-three is the case this exists for.
   */
  const addedCutoff = useMemo(() => new Date(Date.now() - 86_400_000).toISOString(), []);

  const matchesStatus = useCallback(
    (g: SocialTarget) => {
      if (status === 'active') return g.enabled;
      if (status === 'paused') return !g.enabled;
      if (status === 'favorites') return Boolean(g.favorite);
      if (status === 'recent') return Boolean(g.last_published_at && g.last_published_at > recentCutoff);
      if (status === 'new') return Boolean(g.created_at && g.created_at > addedCutoff);
      return true;
    },
    [status, recentCutoff, addedCutoff],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (g) =>
        matchesStatus(g) &&
        (audience === 'all' || audienceOf(g) === audience) &&
        (!cityFilter || cityOf(g) === cityFilter) &&
        (!categoryFilter || (g.category || '') === categoryFilter) &&
        (!q || g.name.toLowerCase().includes(q) || g.url.toLowerCase().includes(q) || (g.category ?? '').toLowerCase().includes(q)),
    );
  }, [all, query, matchesStatus, audience, cityFilter, categoryFilter, cityOf]);

  const cities = useMemo(() => sortCities(all.map(cityOf)), [all, cityOf]);
  const categories = useMemo(() => Array.from(new Set(all.map((g) => g.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'he')), [all]);
  /* Only this slice is drawn; `visible` remains the real filtered set. */
  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);

  /* A new filter means a new list, so start from the top again. */
  useEffect(() => {
    setShown(CHUNK);
  }, [query, cityFilter, categoryFilter, status, audience]);

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
      added: all.filter((g) => g.created_at && g.created_at > addedCutoff).length,
      customers: all.filter((g) => audienceOf(g) === 'customers').length,
      noCustomers: all.filter((g) => audienceOf(g) === 'none').length,
      unmarked: all.filter((g) => audienceOf(g) === 'unknown').length,
    }),
    [all, recentCutoff, addedCutoff],
  );

  /*
   * MARKING, IN ONE PLACE — used by a single group's menu, by the selection bar
   * and by the suggestion sheet. The wording of the confirmation the owner gets
   * is part of the feature: "אין לקוחות" means nothing will be published there
   * again while the switch is on, and that is said in the toast rather than
   * discovered from an empty round.
   */
  const MARK_DONE: Record<Audience, string> = {
    customers: 'סומנה: יש שם לקוחות פוטנציאליים.',
    none: 'סומנה: אין שם לקוחות. לא נפרסם אליה כל עוד המתג בהגדרות מופעל.',
    unknown: 'הסימון הוסר.',
  };
  /*
   * WHAT A ROW SHOULD SAY ABOUT ITS MARK — and when it should say nothing.
   *
   * Only the two cases that change what happens: marked as having none (never
   * published to while the switch is on) and unmarked WHILE THE SWITCH IS ON,
   * which is a group quietly receiving nothing. "יש לקוחות" is the normal case
   * once the list has been walked, and a green chip on a hundred and twenty
   * cards is noise, not information.
   */
  const audienceNote = useCallback(
    (g: SocialTarget): string => {
      const mark = audienceOf(g);
      if (mark === 'none') return AUDIENCE_SHORT.none;
      if (mark === 'unknown' && limits?.customersOnly) return 'לא סומנה — לא תקבל פרסום';
      return '';
    },
    [limits],
  );

  const markOne = (g: SocialTarget, mark: Audience) =>
    act(`aud-${g.id}`, () => updateTarget(g.id, { audience: mark }), MARK_DONE[mark]);
  const markMany = (ids: string[], mark: Audience) =>
    act('bulk-aud', () => bulkUpdateTargets(ids, { audience: mark }), `${ids.length} קבוצות — ${MARK_DONE[mark]}`);

  /*
   * WHAT WE WOULD GUESS, for every group nobody has marked yet.
   *
   * Computed on the spot rather than stored: it is a reading of the group's name
   * against the cities the owner typed into settings, and both of those change.
   * Storing a guess would also blur the one distinction this feature rests on —
   * a mark is something the owner decided, and a guess is not a mark.
   */
  const suggestions = useMemo(
    () => (suggestOpen ? suggestForAll(all.map((g) => ({ ...g, city: cityOf(g) })), business) : []),
    [suggestOpen, all, business, cityOf],
  );
  const suggestChosen = suggestions.filter((r) => !suggestOff[r.id]);

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

  /* A share link is a real answer here, just not a finished one — the worker
     follows it. Treating it as invalid meant rejecting the link Facebook's own
     app puts on the clipboard. */
  const parsed = parseGroupUrl(form.url);
  const pendingShare = parsed ? null : parseGroupShareUrl(form.url);
  const accepted = parsed ?? pendingShare;
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
      { label: 'שייך לעיר', icon: <MapPinIcon className={mk} />, onSelect: () => setCityFor([g.id]) },
      /*
       * THE MARK, on the group's own menu — where somebody who has just looked
       * at a group decides about it. Only the marks it does not already have,
       * so the menu never offers a no-op; when it is already marked, the way
       * back is "בטל סימון" rather than a second identical row.
       */
      ...(audienceOf(g) !== 'customers'
        ? [{ label: 'סמן: יש כאן לקוחות', icon: <CheckIcon className={mk} />, onSelect: () => markOne(g, 'customers') }]
        : []),
      ...(audienceOf(g) !== 'none'
        ? [{ label: 'סמן: אין כאן לקוחות', icon: <CloseIcon className={mk} />, onSelect: () => markOne(g, 'none') }]
        : []),
      ...(audienceOf(g) !== 'unknown'
        ? [{ label: 'בטל סימון קהל', icon: <RepeatIcon className={mk} />, onSelect: () => markOne(g, 'unknown') }]
        : []),
      { label: g.favorite ? 'הסר מהמועדפות' : 'הוסף למועדפות', icon: <StarIcon className={mk} />, onSelect: () => act(`fav-${g.id}`, () => updateTarget(g.id, { favorite: !g.favorite })) },
      { label: g.enabled ? 'השהה קבוצה' : 'הפעל קבוצה', icon: g.enabled ? <PauseIcon className={mk} /> : <PlayIcon className={mk} />, onSelect: () => act(`on-${g.id}`, () => updateTarget(g.id, { enabled: !g.enabled }), g.enabled ? 'הקבוצה הושהתה.' : 'הקבוצה הופעלה.') },
      /* The same request as before — it clears last_synced_at and the worker
         re-opens the group — but the visit now also reads whether this account
         can still post there, so the label says both things it does. */
      /* One group, deliberately: this is the call that wants a new cover as
         well, so it clears the stored one and the worker fetches it. */
      { label: 'רענן ובדוק קבוצה', icon: <RepeatIcon className={mk} />, onSelect: () => act(`sync-${g.id}`, () => requestGroupRefresh([g.id], { picture: true }), 'התוכנה במחשב תבדוק את הקבוצה כשתהיה פנויה.') },
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
    /* The bulk marks. This is how a list of a hundred and twenty groups gets
       marked in an evening: filter to a city, select all, one tap. */
    { label: 'סמן: יש כאן לקוחות', icon: <CheckIcon className={mk} />, disabled: selected.length === 0, onSelect: () => markMany(selected, 'customers') },
    { label: 'סמן: אין כאן לקוחות', icon: <CloseIcon className={mk} />, disabled: selected.length === 0, onSelect: () => markMany(selected, 'none') },
    { label: 'בטל סימון קהל', icon: <RepeatIcon className={mk} />, disabled: selected.length === 0, onSelect: () => markMany(selected, 'unknown') },
    { label: 'שייך לעיר', icon: <MapPinIcon className={mk} />, disabled: selected.length === 0, onSelect: () => setCityFor(selected) },
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
        <div className="flex items-center gap-1.5">
          {/*
            "בדוק הכל" — asked for after the owner left a group on Facebook and
            the app went on counting it.

            It is requestGroupRefresh() with no ids, which is the call the
            per-group menu already makes: it clears last_synced_at and the
            worker re-opens each group, reads its name and picture as it always
            has, and now also reads whether this account can still post there.

            SLOW ON PURPOSE, and the pace is not this button's to set. The
            worker takes two groups per tick with four seconds between them,
            and only in a window where no publication is due — so a hundred
            groups are checked over an hour of idle time rather than in a burst
            of a hundred page loads, which is the shape of traffic that gets a
            Facebook account looked at. The toast says so instead of implying
            the list will change while they watch.
          */}
          <Button
            variant="secondary"
            busy={busy === 'recheck'}
            onClick={() =>
              act('recheck', () => requestGroupRefresh(), 'התוכנה במחשב תעבור על הקבוצות ותבדוק בכל אחת אם עדיין אפשר לפרסם. זה נעשה לאט, בין פרסומים.')
            }
          >
            בדוק הכל
          </Button>
          <Button onClick={() => setAddOpen(true)}>+ הוסף</Button>
        </div>
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
          WHO THE CUSTOMERS ARE — the card that explains the mark, and the one
          place the switch's cost is spelled out.
          *
          * It appears only when there is something to do: groups exist, and
          * either some are unmarked or the switch is on. Once every group is
          * marked and the owner has settled it, the card gets out of the way.
          *
          * The number is the whole point of it. With the switch on, unmarked
          * groups receive nothing — so "37 קבוצות לא יקבלו פרסום" has to be on
          * screen BEFORE an empty round teaches it.
        */}
        {groups && all.length > 0 && (statusCounts.unmarked > 0 || limits?.customersOnly) && (
          <Card padded={false} className="px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-mist-100">לפרסם רק לאן שיש לקוחות</p>
                <p className="mt-0.5 text-xs leading-relaxed text-mist-500">
                  {limits?.customersOnly ? (
                    <>
                      המתג מופעל: מפרסמים רק ל-{statusCounts.customers} הקבוצות שסימנתם שיש בהן לקוחות.
                      {statusCounts.unmarked > 0 && (
                        <>
                          {' '}
                          <strong className="text-warning-400">
                            {statusCounts.unmarked} קבוצות עוד לא סומנו ולא יקבלו פרסום
                          </strong>{' '}
                          — סמנו אותן כדי שיחזרו לפרסום.
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      סמנו בכל קבוצה אם יש בה לקוחות פוטנציאליים. אחרי שתסמנו, הפעילו בהגדרות את "לפרסם רק לקבוצות עם לקוחות" — ואז
                      פרסום לא ייצא לקבוצות שסימנתם שאין בהן לקוחות. כרגע המתג כבוי והפרסום יוצא לכל הקבוצות הפעילות.
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {statusCounts.unmarked > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSuggestOff({});
                      setSuggestOpen(true);
                    }}
                  >
                    <SparklesIcon className="h-4 w-4" />
                    הצע סימון
                  </Button>
                )}
                <ButtonLink href="/social/settings" variant="ghost">
                  להגדרות
                </ButtonLink>
              </div>
            </div>
          </Card>
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
                /* Kept APART from "פורסם לאחרונה" rather than beside it. The
                   two read alike and answer opposite questions — one is where
                   the content went, the other is what was just added and not
                   set up yet — and two chips a tap apart is how you end up
                   looking at the wrong list without noticing. */
                { value: 'new', label: 'נוסף לאחרונה', count: groups ? statusCounts.added : undefined },
                { value: 'favorites', label: 'מועדפות', count: groups ? statusCounts.favorites : undefined },
                { value: 'recent', label: 'פורסם לאחרונה', count: groups ? statusCounts.recent : undefined },
                { value: 'paused', label: 'מושהות', count: groups ? statusCounts.paused : undefined },
              ]}
            />
            {/*
              THE CUSTOMERS FILTER, its own row.
              *
              * It is not a variation on "status": a group can be active and
              * unmarked, or paused and full of customers. Keeping the two
              * dimensions apart is what lets the owner do the one job this
              * screen now has — walk the unmarked ones and decide.
            */}
            <SegmentedControl
              variant="chips"
              label="קהל"
              value={audience}
              onChange={setAudience}
              options={[
                { value: 'all', label: 'כל הקבוצות', count: groups ? statusCounts.all : undefined },
                { value: 'customers', label: 'יש לקוחות', count: groups ? statusCounts.customers : undefined },
                { value: 'unknown', label: 'לא סומנו', count: groups ? statusCounts.unmarked : undefined },
                { value: 'none', label: 'אין לקוחות', count: groups ? statusCounts.noCustomers : undefined },
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
                  {/* Four across a phone, which is what the owner asked for and what the
                      card was resized to fit: ~80px each at 375px. */}
                  <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 [&>*]:min-w-0">
                    {section.items.map((g) => (
                      <GroupCard
                        key={g.id}
                        group={g}
                        selectionMode={picking}
                        selected={selected.includes(g.id)}
                        onSelect={(on) => toggleSelect(g.id, on)}
                        actions={menuFor(g)}
                        nextAt={nextByTarget[g.id]}
                        cityLabel={cityOf(g)}
                        audienceNote={audienceNote(g)}
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
                      {/* The reason it is off, where the eye already is. A
                          group that switched itself off with no explanation is
                          a group the owner switches back on and watches fail
                          again. */}
                      {g.last_status === 'left' && !g.enabled ? (
                        <p dir="auto" className="truncate text-[11px] font-bold text-warning-400">
                          אי אפשר לפרסם בקבוצה הזו — כנראה יצאתם ממנה
                        </p>
                      ) : (
                        <p dir="auto" className="truncate text-[11px] text-mist-500">
                          {cityOf(g)}
                          {g.category ? ` · ${g.category}` : ''} · {g.last_published_at ? `פורסם ${formatDayMonthHe(g.last_published_at)}` : 'טרם פורסם'}
                          {/* The mark, only where it changes what happens —
                              same rule as the card. */}
                          {audienceNote(g) && <span className="font-bold text-warning-400"> · {audienceNote(g)}</span>}
                        </p>
                      )}
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
        <div data-overlay className="fixed inset-x-0 bottom-[calc(4.5rem+var(--safe-b))] z-40 px-3 md:bottom-4">
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

      {/*
        CITY ASSIGNMENT — one tap per group, or one tap for fifty.

        detectCity() reads the group's NAME, and 57 of these groups are named
        things it cannot read, so they all pile into "אחר" and the owner has no
        way to sort them. This is that way: the cities already in use plus the
        ones the detector knows, as buttons — no typing for the common case,
        and a free field for a city nobody has used yet.

        It writes `city`, which is what cityOf() prefers over the guess, so the
        group moves into its section and the card's chip turns brand-coloured
        the moment this closes.
      */}
      <Sheet
        open={cityFor !== null}
        onClose={() => setCityFor(null)}
        title={cityFor?.length === 1 ? 'שיוך לעיר' : `שיוך לעיר של ${cityFor?.length ?? 0} קבוצות`}
      >
        <p className="mb-3 text-sm text-mist-500">
          {cityFor?.length === 1
            ? 'בחרו עיר לקבוצה הזו. הקבוצה תעבור לקטע של אותה עיר, והסינון לפי עיר יכלול אותה.'
            : 'בחרו עיר לכל הקבוצות שסימנתם. הן יעברו לקטע של אותה עיר יחד.'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {cityChoices.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy === 'bulk-city'}
              onClick={() => {
                const ids = cityFor ?? [];
                setCityFor(null);
                act('bulk-city', () => bulkUpdateTargets(ids, { city: c }), ids.length === 1 ? `שויכה ל${c}.` : `${ids.length} קבוצות שויכו ל${c}.`);
              }}
              className="min-h-11 rounded-xl bg-ink-800 px-3.5 text-sm font-bold text-mist-100 transition-colors hover:bg-ink-700 disabled:opacity-50"
            >
              <span dir="auto">{c}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-ink-700 pt-4">
          <Field label="עיר אחרת" hint="נשמרת ותופיע ברשימה למעלה בפעם הבאה.">
            <input
              className={inputClass}
              value={cityDraft}
              onChange={(e) => setCityDraft(e.target.value)}
              placeholder="שם העיר"
            />
          </Field>
          <Button
            className="mt-2 w-full"
            size="lg"
            disabled={!cityDraft.trim()}
            busy={busy === 'bulk-city'}
            onClick={() => {
              const ids = cityFor ?? [];
              const c = cityDraft.trim();
              setCityFor(null);
              setCityDraft('');
              act('bulk-city', () => bulkUpdateTargets(ids, { city: c }), ids.length === 1 ? `שויכה ל${c}.` : `${ids.length} קבוצות שויכו ל${c}.`);
            }}
          >
            שמור עיר
          </Button>
          {/* Clearing it is not the same as choosing "אחר": it hands the group
              back to the detector, which is the right answer when a city was
              set by mistake on a group whose name does say where it is. */}
          <button
            type="button"
            className="mt-2 min-h-11 w-full text-xs font-bold text-mist-500 underline"
            onClick={() => {
              const ids = cityFor ?? [];
              setCityFor(null);
              act('bulk-city', () => bulkUpdateTargets(ids, { city: '' }), 'השיוך נוקה — העיר תיקבע לפי שם הקבוצה.');
            }}
          >
            נקה שיוך וחזור לזיהוי לפי השם
          </button>
        </div>
      </Sheet>

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
      {/*
        THE SUGGESTION, AS A LIST THE OWNER READS BEFORE ANYTHING IS WRITTEN.
        *
        * A hundred and twenty groups is too many to mark one at a time, and
        * "mark them all automatically" is not something this product may do:
        * which groups hold his customers is a judgement about his own business,
        * and a machine that makes it silently will eventually cross out the one
        * group half his work comes from.
        *
        * So the sheet shows every group it would change, what it would mark it
        * as, AND WHY, in one line each — and every row can be switched off. The
        * button applies exactly what is left. Groups the owner has already
        * marked are not in this list at all: a guess never overwrites a
        * decision, not even one it agrees with.
      */}
      <Sheet
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        title="הצעת סימון לפי שם הקבוצה"
        size="lg"
        footer={
          <Button
            size="lg"
            className="w-full"
            disabled={suggestChosen.length === 0}
            busy={busy === 'bulk-suggest'}
            onClick={() => {
              const yes = suggestChosen.filter((r) => r.verdict === 'customers').map((r) => r.id);
              const no = suggestChosen.filter((r) => r.verdict === 'none').map((r) => r.id);
              setSuggestOpen(false);
              act(
                'bulk-suggest',
                async () => {
                  /* Two writes, because they are two different values — and the
                     "yes" list goes first: if the second call fails, what is
                     left behind is groups that publish, not groups that
                     silently stopped. */
                  if (yes.length) await bulkUpdateTargets(yes, { audience: 'customers' });
                  if (no.length) await bulkUpdateTargets(no, { audience: 'none' });
                },
                `סומנו ${yes.length} עם לקוחות ו-${no.length} בלי. אפשר לשנות כל אחת ביד.`,
              );
            }}
          >
            {suggestChosen.length ? `סמן ${suggestChosen.length} קבוצות` : 'לא נבחרה אף קבוצה'}
          </Button>
        }
      >
        <p className="mb-3 text-sm leading-relaxed text-mist-500">
          זאת הצעה בלבד, לפי מה שכתוב בשם הקבוצה ולפי הערים שרשמתם בהגדרות. עברו על הרשימה, כבו כל שורה שלא מתאימה, ורק אז אשרו.
          {business.cities.length === 0 && (
            <>
              {' '}
              <strong className="text-warning-400">לא רשמתם בהגדרות באילו ערים אתם עובדים</strong> — בלי זה אנחנו לא יכולים לזהות קבוצות
              שמחוץ לאזור שלכם, ורק הנושא של הקבוצה נבדק.
            </>
          )}
        </p>
        {suggestions.length === 0 ? (
          <p className="text-sm text-mist-300">
            אין לנו הצעה לאף קבוצה שלא סומנה. השם של כל אחת מהן לא אומר מספיק — תסמנו אותן ביד, או לפי עיר: סננו לעיר, "בחר", ואז "סמן: יש
            כאן לקוחות".
          </p>
        ) : (
          <ul className="space-y-1.5">
            {suggestions.map((r) => {
              const on = !suggestOff[r.id];
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSuggestOff((o) => ({ ...o, [r.id]: on }))}
                    className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-colors ${
                      on ? 'border-brand-300/40 bg-brand-300/8' : 'border-ink-700 opacity-60'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${
                        on ? 'border-brand-500 bg-brand-500 text-on-brand' : 'border-mist-500'
                      }`}
                    >
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span dir="auto" className="truncate text-sm font-bold text-mist-100">
                          {r.name}
                        </span>
                        <Badge tone={r.verdict === 'customers' ? 'good' : 'bad'}>
                          {r.verdict === 'customers' ? AUDIENCE_SHORT.customers : AUDIENCE_SHORT.none}
                        </Badge>
                      </span>
                      {/* The reason, always. A mark with no reason is a mark
                          nobody can check — and he is being asked to trust it
                          with his whole group list. */}
                      <span dir="auto" className="mt-0.5 block text-xs leading-relaxed text-mist-500">
                        {r.why}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="הוספת קבוצות" size="lg">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!accepted) {
              toast('כתובת לא תקינה — צריך קישור לקבוצה מפייסבוק.', 'error');
              return;
            }
            act('add', () => addGroup(form).then(() => setForm({ url: '', name: '' })), 'הקבוצה נוספה. השם והתמונה יימשכו מפייסבוק אוטומטית.');
          }}
        >
          <Field
            label="קישור לקבוצה"
            hint={
              parsed
                ? `זוהה: ${parsed.externalId}`
                : pendingShare
                  ? 'קישור שיתוף — התוכנה במחשב תפתח אותו ותזהה את הקבוצה'
                  : 'facebook.com/groups/… או קישור שיתוף מהאפליקציה'
            }
          >
            <input className={inputClass} dir="ltr" inputMode="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.facebook.com/groups/…" />
          </Field>
          <Field label="שם (רשות)">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="באר שבע ביחד" />
          </Field>
          <Button type="submit" size="lg" className="w-full" busy={busy === 'add'} disabled={!accepted}>
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
