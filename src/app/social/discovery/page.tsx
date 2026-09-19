'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DiscoveryCapture, type CaptureResult } from '@/components/social/DiscoveryCapture';
import { DiscoveryGroupCard } from '@/components/social/DiscoveryGroupCard';
import { DiscoverySearchBuilder } from '@/components/social/DiscoverySearchBuilder';
import { SocialShell } from '@/components/social/SocialShell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  SegmentedControl,
  Skeleton,
  SkeletonList,
  StatCard,
  inputClass,
  useConfirm,
  useToast,
} from '@/components/social/ui';
import { CheckCircleIcon, ClockIcon, SearchIcon, SparklesIcon, UsersIcon } from '@/components/icons';
import { getBusiness, listWorkers } from '@/lib/social/client';
import { OTHER_CITY, sortCities } from '@/lib/social/cities';
import {
  capturePastedGroups,
  discoveryCounts,
  listDiscovered,
  promoteToTargets,
  requestEnrichment,
  setIgnored,
  setMembership,
  type DiscoveredGroup,
  type Membership,
} from '@/lib/social/discovery';
import { friendlyMessage } from '@/lib/social/errors';

type Filter = 'all' | 'not_member' | 'new' | 'public' | 'private' | 'in_library' | 'requested' | 'ignored';
type Sort = 'discovered' | 'members' | 'name' | 'match';

/* Same reasoning as the groups screen: each tile is ~25 elements, so the list
   is drawn in slices while filtering and selection stay over the whole set. */
const CHUNK = 30;
const NEW_DAYS = 7;

/**
 * /social/discovery — one screen for the whole discovery flow:
 * city → phrases → search on Facebook → paste what was found → check whether
 * I am already a member → open and join → mark the status → move into the
 * publishing library.
 *
 * What the system does and does not do is stated on the screen, not implied.
 * Meta removed the Groups API in April 2024: there is no endpoint that
 * searches groups the owner is not in, and none that sends a join request.
 * So the searching and the joining happen in the owner's own browser, and
 * everything around them — the phrases, the link extraction, the duplicate
 * check, the profile reading — is done here.
 */
export default function DiscoveryPage() {
  const [rows, setRows] = useState<DiscoveredGroup[] | null>(null);
  const [counts, setCounts] = useState<{ found: number; notMember: number; pending: number; member: number } | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  const [builderOpen, setBuilderOpen] = useState(true);
  const [captureOpen, setCaptureOpen] = useState(true);
  const [city, setCity] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [opened, setOpened] = useState<string[]>([]);
  const [lastKeyword, setLastKeyword] = useState('');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('discovered');
  const [shown, setShown] = useState(CHUNK);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoteReasons, setPromoteReasons] = useState<string[]>([]);
  const [promoteNotes, setPromoteNotes] = useState<string[]>([]);
  /** The first load failed: show why and how to retry, never a forever-skeleton. */
  const [loadFailed, setLoadFailed] = useState(false);

  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const [discovered, stats, workers] = await Promise.all([
      listDiscovered({ includeIgnored: true }),
      discoveryCounts(),
      listWorkers().catch(() => []),
    ]);
    setRows(discovered);
    setCounts(stats);
    setWorkerOnline(workers.some((w) => w.online));
  }, []);

  /* A failed load must STOP, visibly. Leaving rows at null showed the error
     notice with a skeleton spinning under it for ever — and the likeliest cause
     of all is that supabase/social-schema-v8.sql has not been run yet, which
     friendlyMessage() already turns into the "run the database update" line. */
  const reload = useCallback(() => {
    setError(null);
    setLoadFailed(false);
    load().catch((err) => {
      setError(friendlyMessage(err, 'טעינת רשימת הגילוי נכשלה.'));
      setLoadFailed(true);
    });
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    getBusiness()
      .then((b) => {
        const cities = sortCities(b.cities ?? [], b.cities ?? []).filter((c) => c !== OTHER_CITY);
        setCityOptions(cities);
        setCity((current) => current || cities[0] || OTHER_CITY);
      })
      .catch(() => setCity((current) => current || OTHER_CITY));
  }, []);

  const effectiveCity = city === OTHER_CITY ? customCity.trim() : city;

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

  const all = useMemo(() => rows ?? [], [rows]);
  /* A number, not a string: Postgres renders timestamptz as "…+00:00" while
     toISOString() ends in "Z", so comparing the two as text is not comparing
     dates. Date.parse on both sides makes it an instant comparison. */
  const newCutoff = useMemo(() => Date.now() - NEW_DAYS * 86_400_000, []);
  const isNew = useCallback((g: DiscoveredGroup) => Date.parse(g.discoveredAt) > newCutoff, [newCutoff]);

  const matchesFilter = useCallback(
    (g: DiscoveredGroup) => {
      if (filter === 'ignored') return g.ignored;
      if (g.ignored) return false;
      if (filter === 'not_member') return g.membership === 'NOT_MEMBER' || g.membership === 'UNKNOWN';
      if (filter === 'new') return isNew(g);
      if (filter === 'public') return g.privacy === 'public';
      if (filter === 'private') return g.privacy === 'private';
      if (filter === 'in_library') return Boolean(g.targetId);
      if (filter === 'requested') return g.membership === 'JOIN_REQUEST_SENT';
      return true;
    },
    [filter, isNew],
  );

  /* "התאמה" is computed from real data only: how many of the words in the
     phrases currently on screen appear in the group's own name. With no
     phrases there is nothing to measure, so the option is not offered. */
  const matchWords = useMemo(
    () =>
      Array.from(new Set(phrases.flatMap((p) => p.toLowerCase().split(/\s+/)))).filter((w) => w.length > 1),
    [phrases],
  );
  const matchScore = useCallback(
    (g: DiscoveredGroup) => {
      if (!matchWords.length || !g.name) return 0;
      const name = g.name.toLowerCase();
      return matchWords.filter((w) => name.includes(w)).length;
    },
    [matchWords],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter(
      (g) => matchesFilter(g) && (!q || g.name.toLowerCase().includes(q) || g.url.toLowerCase().includes(q) || g.city.toLowerCase().includes(q)),
    );
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => (a.name || a.url).localeCompare(b.name || b.url, 'he'));
    else if (sort === 'match') sorted.sort((a, b) => matchScore(b) - matchScore(a));
    else if (sort === 'members') {
      // A group whose member count nobody has read is not "zero members" — it
      // has no number at all, so it sorts after every group that does.
      sorted.sort((a, b) => {
        const av = typeof a.membersCount === 'number' ? a.membersCount : -1;
        const bv = typeof b.membersCount === 'number' ? b.membersCount : -1;
        return bv - av;
      });
    } else sorted.sort((a, b) => b.discoveredAt.localeCompare(a.discoveredAt));
    return sorted;
  }, [all, query, matchesFilter, sort, matchScore]);

  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);

  useEffect(() => {
    setShown(CHUNK);
  }, [query, filter, sort]);

  const live = useMemo(() => all.filter((g) => !g.ignored), [all]);
  const filterCounts = useMemo(
    () => ({
      all: live.length,
      not_member: live.filter((g) => g.membership === 'NOT_MEMBER' || g.membership === 'UNKNOWN').length,
      new: live.filter(isNew).length,
      public: live.filter((g) => g.privacy === 'public').length,
      private: live.filter((g) => g.privacy === 'private').length,
      in_library: live.filter((g) => Boolean(g.targetId)).length,
      requested: live.filter((g) => g.membership === 'JOIN_REQUEST_SENT').length,
      ignored: all.filter((g) => g.ignored).length,
    }),
    [live, all, isNew],
  );

  const toggleSelect = (id: string, on: boolean) => setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));

  /** Opt-in, per batch, and never dressed up as something it is not. */
  async function askEnrich(count: number): Promise<boolean> {
    return confirm.ask({
      title: `לבדוק ${count} קבוצות?`,
      body: (
        <div className="space-y-2">
          <p>המערכת תפתח את דפי הקבוצות בכרום שעל המחשב שלכם, מחוברים לחשבון שלכם, ותקרא מה שכתוב בדף: שם, תמונה, מספר חברים, ציבורית או פרטית, והאם אתם כבר חברים.</p>
          <p>זה בדיוק אותו מנגנון שמפרסם עבורכם — לא API של פייסבוק. לכן זה נעשה לאט, שתיים בכל סבב, ורק כשה-worker פנוי מפרסום.</p>
          <p>קריאה של קבוצות שאתם לא חברים בהן בולטת יותר מקריאה של הקבוצות שלכם, ולכן זה נעשה רק כשאתם מבקשים ולא מעצמו.</p>
          <p>פרט שהדף לא אומר במפורש יישאר ריק — המערכת לא מנחשת.</p>
        </div>
      ),
      confirmLabel: 'בדוק',
    });
  }

  async function onCapture(text: string): Promise<CaptureResult | null> {
    let result: CaptureResult | null = null;
    await act('capture', async () => {
      result = await capturePastedGroups(text, { city: effectiveCity, keyword: lastKeyword });
    });
    return result;
  }

  async function promote(ids: string[]) {
    await act(`promote-${ids.length === 1 ? ids[0] : 'bulk'}`, async () => {
      const res = await promoteToTargets(ids);
      setPromoteReasons(res.reasons);
      setPromoteNotes(res.notes);
      toast(
        res.added > 0
          ? `${res.added} קבוצות נוספו למאגר הפרסום${res.skipped > 0 ? `, ${res.skipped} לא נוספו` : ''}.`
          : 'אף קבוצה לא נוספה למאגר.',
        res.added > 0 ? 'success' : 'info',
      );
      setSelected([]);
    });
  }

  const hasAny = rows !== null && all.length > 0;

  return (
    <SocialShell
      title="גילוי קבוצות"
      lede="מוצאים קבוצות חדשות ומעבירים אותן למאגר הפרסום"
      headerAction={
        <Button
          variant="secondary"
          onClick={() => {
            setCaptureOpen(true);
            document.getElementById('discovery-capture')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          הדבק קישורים
        </Button>
      }
    >
      <div className="space-y-4 pb-24">
        {error && (
          <Notice tone="error">
            <span className="block">{error}</span>
            {loadFailed && (
              <span className="mt-1 block text-xs">
                אם זו הפעם הראשונה שאתם נכנסים למסך הזה — צריך להריץ את הקובץ <code dir="ltr">supabase/social-schema-v8.sql</code> ב-SQL Editor של Supabase.
              </span>
            )}
            <Button size="sm" variant="secondary" className="mt-2" onClick={reload}>
              נסו שוב
            </Button>
          </Notice>
        )}

        {/* The four counters. Each one is a number the database returned; until
            it has, the tile is a placeholder rather than a zero. */}
        {/* Hidden entirely when the load failed: four skeletons that never resolve
            are just a second forever-spinner. */}
        <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-4 [&>*]:min-w-0 ${counts === null && loadFailed ? 'hidden' : ''}`}>
          {counts === null ? (
            <>
              <Skeleton className="h-[104px] rounded-2xl" />
              <Skeleton className="h-[104px] rounded-2xl" />
              <Skeleton className="h-[104px] rounded-2xl" />
              <Skeleton className="h-[104px] rounded-2xl" />
            </>
          ) : (
            <>
              <StatCard label="נמצאו" value={counts.found} icon={<SearchIcon className="h-4.5 w-4.5" />} tone="brand" />
              <StatCard label="לא חבר" value={counts.notMember} icon={<UsersIcon className="h-4.5 w-4.5" />} tone="neutral" />
              <StatCard label="בקשות ממתינות" value={counts.pending} icon={<ClockIcon className="h-4.5 w-4.5" />} tone="warn" />
              <StatCard label="אני חבר" value={counts.member} icon={<CheckCircleIcon className="h-4.5 w-4.5" />} tone="good" />
            </>
          )}
        </div>

        {/* 1 — phrases. */}
        <Card
          id="discovery-builder"
          title="1. בחרו עיר וצרו חיפושים"
          subtitle="לפייסבוק אין ממשק שמחפש קבוצות שאתם לא חברים בהן, ולכן המערכת מכינה את ביטויי החיפוש ופותחת לכם את החיפוש של פייסבוק עצמו — את החיפוש אתם עושים בדפדפן."
          action={
            <Button size="sm" variant="secondary" onClick={() => setBuilderOpen((v) => !v)}>
              {builderOpen ? 'הסתר' : 'פתח'}
            </Button>
          }
        >
          {builderOpen && (
            <DiscoverySearchBuilder
              cityOptions={cityOptions}
              city={city}
              onCity={setCity}
              customCity={customCity}
              onCustomCity={setCustomCity}
              effectiveCity={effectiveCity}
              domains={domains}
              onDomains={setDomains}
              phrases={phrases}
              onPhrases={setPhrases}
              opened={opened}
              onOpen={(p) => {
                setOpened((s) => [...new Set([...s, p])]);
                setLastKeyword(p);
              }}
            />
          )}
        </Card>

        {/* 2 — capture. */}
        <Card
          id="discovery-capture"
          title="2. הדביקו את הקבוצות שמצאתם"
          subtitle="המערכת שולפת את הקישורים מתוך כל טקסט, מסננת כפילויות ומסמנת מה כבר קיים אצלכם."
          action={
            <Button size="sm" variant="secondary" onClick={() => setCaptureOpen((v) => !v)}>
              {captureOpen ? 'הסתר' : 'פתח'}
            </Button>
          }
        >
          {captureOpen && <DiscoveryCapture busy={busy === 'capture'} onCapture={onCapture} />}
        </Card>

        {workerOnline === false && (
          <Notice tone="warn">
            ה-worker המקומי לא רץ, ולכן &quot;בדוק סטטוס&quot; לא יתבצע עכשיו. הפעילו אותו על המחשב: <code dir="ltr">npm run social-worker</code>
          </Notice>
        )}

        {promoteReasons.length > 0 && (
          <Notice tone="warn">
            <span className="mb-1 block font-bold">קבוצות שלא נוספו למאגר:</span>
            <ul className="space-y-0.5">
              {promoteReasons.map((reason) => (
                <li key={reason} dir="auto">
                  {reason}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {/* Groups that DID go in but are worth a word. Separate from the list
            above: a group that was linked rather than re-created succeeded, and
            printing it under "not added" would say the opposite. */}
        {promoteNotes.length > 0 && (
          <Notice tone="info">
            <ul className="space-y-0.5">
              {promoteNotes.map((note) => (
                <li key={note} dir="auto">
                  {note}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {rows === null && !loadFailed && (
          <Card>
            <SkeletonList rows={4} />
          </Card>
        )}

        {/* "nothing found yet" is a claim about the data. It must not be made
            when the data never arrived. */}
        {rows !== null && all.length === 0 && (
          <EmptyState
            icon={<SparklesIcon className="h-5 w-5" />}
            title="עוד לא נאספו קבוצות"
            description="התחילו משלב 1: בחרו עיר, צרו ביטויי חיפוש, פתחו אותם בפייסבוק — ואז הדביקו כאן את הקישורים של הקבוצות שמצאתם."
            action={
              <Button
                onClick={() => {
                  setBuilderOpen(true);
                  // Step 1, not step 2 — this button says "create searches".
                  document.getElementById('discovery-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                צרו חיפושים
              </Button>
            }
          />
        )}

        {hasAny && (
          <>
            <Notice tone="info">
              3. המערכת לא יכולה להצטרף לקבוצה במקומכם — אין לפייסבוק ממשק כזה. הכפתור פותח את הקבוצה, ההצטרפות נעשית שם בלחיצה שלכם, וכשחוזרים מסמנים כאן &quot;שלחתי בקשה&quot; או &quot;אני חבר&quot;.
            </Notice>

            <Card padded={false} className="p-3">
              <input
                className={inputClass}
                type="search"
                placeholder="חיפוש בתוך הקבוצות שנמצאו…"
                aria-label="חיפוש בקבוצות שנמצאו"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="mt-2.5 min-w-0 space-y-2 overflow-x-auto scrollbar-none">
                <SegmentedControl
                  size="sm"
                  label="סינון"
                  value={filter}
                  onChange={setFilter}
                  className="min-w-max"
                  options={[
                    { value: 'all', label: 'הכל', count: filterCounts.all },
                    { value: 'not_member', label: 'לא חבר / לא ידוע', count: filterCounts.not_member },
                    { value: 'new', label: 'חדשות', count: filterCounts.new },
                    { value: 'requested', label: 'בקשה נשלחה', count: filterCounts.requested },
                    { value: 'public', label: 'ציבוריות', count: filterCounts.public },
                    { value: 'private', label: 'פרטיות', count: filterCounts.private },
                    { value: 'in_library', label: 'כבר במאגר', count: filterCounts.in_library },
                    { value: 'ignored', label: 'מוסתרות', count: filterCounts.ignored },
                  ]}
                />
                <SegmentedControl
                  size="sm"
                  label="מיון"
                  value={sort}
                  onChange={setSort}
                  className="min-w-max"
                  options={[
                    { value: 'discovered', label: 'תאריך גילוי' },
                    { value: 'members', label: 'מספר חברים' },
                    { value: 'name', label: 'שם' },
                    ...(matchWords.length ? [{ value: 'match' as Sort, label: 'התאמה' }] : []),
                  ]}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-bold">
                <button type="button" className="min-h-10 px-1 text-brand-400" onClick={() => setSelected(visible.map((g) => g.id))}>
                  בחר את כל {visible.length} המוצגות
                </button>
                {selected.length > 0 && (
                  <button type="button" className="min-h-10 px-1 text-mist-500" onClick={() => setSelected([])}>
                    נקה בחירה
                  </button>
                )}
              </div>
              {sort === 'match' && (
                <p className="mt-1.5 text-[11px] text-mist-500">התאמה = כמה מילים מביטויי החיפוש שלכם מופיעות בשם הקבוצה.</p>
              )}
              {sort === 'members' && (
                <p className="mt-1.5 text-[11px] text-mist-500">קבוצות שמספר החברים שלהן עוד לא נקרא מופיעות בסוף.</p>
              )}
            </Card>

            {visible.length === 0 && (
              <EmptyState
                icon={<SearchIcon className="h-5 w-5" />}
                title="אין קבוצות שמתאימות לסינון"
                description="נסו לנקות את החיפוש או לבחור 'הכל'."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                    }}
                  >
                    נקה סינון
                  </Button>
                }
              />
            )}

            {visible.length > 0 && (
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
                {page.map((g) => (
                  <DiscoveryGroupCard
                    key={g.id}
                    group={g}
                    selected={selected.includes(g.id)}
                    onSelect={(on) => toggleSelect(g.id, on)}
                    busyKey={
                      busy === `request-${g.id}`
                        ? 'request'
                        : busy === `member-${g.id}`
                          ? 'member'
                          : busy === `promote-${g.id}`
                            ? 'promote'
                            : busy === `ignore-${g.id}`
                              ? 'ignore'
                              : busy === `enrich-${g.id}`
                                ? 'enrich'
                                : null
                    }
                    onMark={(m: Membership) =>
                      act(
                        `${m === 'MEMBER' ? 'member' : 'request'}-${g.id}`,
                        () => setMembership([g.id], m),
                        m === 'MEMBER' ? 'סומן שאתם חברים בקבוצה.' : 'סומן שנשלחה בקשת הצטרפות.',
                      )
                    }
                    onPromote={() => promote([g.id])}
                    onIgnore={() => act(`ignore-${g.id}`, () => setIgnored([g.id], !g.ignored), g.ignored ? 'הקבוצה חזרה לרשימה.' : 'הקבוצה הוסתרה.')}
                    onEnrich={async () => {
                      if (!(await askEnrich(1))) return;
                      await act(`enrich-${g.id}`, () => requestEnrichment([g.id]), 'הקבוצה נכנסה לתור הבדיקה.');
                    }}
                  />
                ))}
              </ul>
            )}

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
          </>
        )}
      </div>

      {/* Bulk bar: sticky above the phone tab bar. data-overlay keeps the page
          entrance animation — and its transform — off a fixed element. */}
      {selected.length > 0 && (
        <div data-overlay className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-ink-850 p-2.5 shadow-2xl ring-1 ring-ink-600">
            <Badge tone="brand">נבחרו {selected.length}</Badge>
            <Button size="sm" busy={busy === 'promote-bulk'} onClick={() => promote(selected)}>
              הוסף למאגר
            </Button>
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 'bulk-request'}
              onClick={() => act('bulk-request', () => setMembership(selected, 'JOIN_REQUEST_SENT'), 'סומנו כבקשות שנשלחו.')}
            >
              סמן בקשת הצטרפות
            </Button>
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 'bulk-member'}
              onClick={() => act('bulk-member', () => setMembership(selected, 'MEMBER'), 'סומנו כקבוצות שאתם חברים בהן.')}
            >
              סמן חבר
            </Button>
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 'bulk-enrich'}
              onClick={async () => {
                if (!(await askEnrich(selected.length))) return;
                await act('bulk-enrich', () => requestEnrichment(selected), 'הקבוצות נכנסו לתור הבדיקה.');
              }}
            >
              בדוק סטטוס
            </Button>
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 'bulk-ignore'}
              onClick={() => act('bulk-ignore', () => setIgnored(selected, true).then(() => setSelected([])), 'הוסתרו.')}
            >
              התעלם
            </Button>
            <button type="button" className="ms-auto min-h-9 px-2 text-xs font-bold text-mist-500" onClick={() => setSelected([])}>
              בטל
            </button>
          </div>
        </div>
      )}

      {confirm.dialog}
    </SocialShell>
  );
}
