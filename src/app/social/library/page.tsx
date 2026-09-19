'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardListIcon, PlusIcon, SearchIcon, TagIcon } from '@/components/icons';
import { ContentCard } from '@/components/social/ContentCard';
import { PostPreview } from '@/components/social/PostPreview';
import { QueueTunerSheet } from '@/components/social/QueueTunerSheet';
import { QuickPublishSheet } from '@/components/social/QuickPublishSheet';
import { SocialShell } from '@/components/social/SocialShell';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Notice,
  SegmentedControl,
  Sheet,
  Skeleton,
  inputClass,
  useConfirm,
  useToast,
  type MenuAction,
} from '@/components/social/ui';
import { archivePost, duplicatePost, getBusiness, savePost } from '@/lib/social/client';
import {
  LIBRARY_USAGE_LIMIT,
  deleteCategory,
  filterLibrary,
  listCategoriesWithState,
  listLibraryWithStats,
  saveCategory,
  setPostCategory,
  type ContentCategory,
  type LibraryFilter,
  type LibraryPost,
} from '@/lib/social/library';
import { friendlyMessage } from '@/lib/social/errors';

type MediaFilter = '' | 'image' | 'video' | 'text';
type PublishedFilter = '' | 'yes' | 'no';
type Sort = 'newest' | 'oldest' | 'most' | 'recent';

/** All = '', uncategorised = this sentinel, otherwise a category id (a uuid). */
const UNCATEGORISED = 'none';

/** Hebrew counts one thing by name, not by "1". "1 פוסטים" reads as a bug. */
const postsLabel = (n: number) => (n === 1 ? 'פוסט אחד' : `${n} פוסטים`);

/*
 * How many cards are drawn at once. Each one carries an image or a <video>
 * element, so a few hundred at once is a slow screen on a phone. Filtering,
 * counting and selection all work over the whole library — only the drawing
 * is incremental, exactly as the groups screen does it.
 */
const CHUNK = 60;

/**
 * /social/library — the content library, and the screen the owner lives on.
 *
 * It is a new view over the posts that already exist (social_posts), not a
 * second place for them to live: creating and editing still route to the
 * existing editor at /social/posts/new and /social/posts/[id]. What is new is
 * the visual grid, owner-managed content categories, real usage counts read
 * from social_queue, and publishing a post without opening it.
 */
export default function LibraryPage() {
  const [items, setItems] = useState<LibraryPost[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  /* v8 has not been run: the categories are not "empty", they are unavailable,
     and the owner needs to be told which file to run rather than left guessing. */
  const [categorySchemaMissing, setCategorySchemaMissing] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('');
  const [publishedFilter, setPublishedFilter] = useState<PublishedFilter>('');
  const [sort, setSort] = useState<Sort>('newest');
  const [selected, setSelected] = useState<string[]>([]);
  const [shown, setShown] = useState(CHUNK);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [publishItem, setPublishItem] = useState<LibraryPost | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [assignOpen, setAssignOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryPost | null>(null);
  const [businessName, setBusinessName] = useState('');

  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [rows, cats, business] = await Promise.all([
        listLibraryWithStats(),
        /*
         * Categories are the one piece that needs a migration the owner may
         * not have run yet. If the table is missing, the library still works —
         * it degrades to "no categories", it does not white-screen.
         */
        listCategoriesWithState().catch((err) => {
          setCategoriesError(friendlyMessage(err, 'רשימת הקטגוריות לא נטענה.'));
          return { items: [] as ContentCategory[], schemaMissing: false };
        }),
        getBusiness(),
      ]);
      setItems(rows.items);
      setTruncated(rows.truncated);
      setCategories(cats.items);
      setCategorySchemaMissing(cats.schemaMissing);
      setBusinessName(business.name);
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const all = useMemo(() => items ?? [], [items]);
  const categoryName = useCallback((id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? null : null), [categories]);

  /* '' = every category, the sentinel = uncategorised, otherwise that id. */
  const categoryPart: LibraryFilter =
    categoryFilter === '' ? {} : categoryFilter === UNCATEGORISED ? { categoryId: null } : { categoryId: categoryFilter };

  /*
   * One filter implementation, shared with the data layer: filterLibrary() is
   * pure and is what listLibrary() itself applies, so a chip's count and the
   * grid below it can never be computed two different ways.
   */
  const visible = useMemo(
    () =>
      filterLibrary(all, {
        q: query,
        ...categoryPart,
        ...(mediaFilter ? { media: mediaFilter } : {}),
        ...(publishedFilter ? { published: publishedFilter } : {}),
        sort,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, query, categoryFilter, mediaFilter, publishedFilter, sort],
  );

  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);

  useEffect(() => {
    setShown(CHUNK);
  }, [query, categoryFilter, mediaFilter, publishedFilter, sort]);

  /*
   * Every count on this screen is counted from the rows that are loaded, by the
   * same function that does the filtering — so a chip can never promise more
   * posts than tapping it will show.
   */
  const countOf = useCallback((f: LibraryFilter) => filterLibrary(all, f).length, [all]);

  const categoryCounts = useMemo(() => {
    const out: Record<string, number> = { '': all.length, [UNCATEGORISED]: countOf({ categoryId: null }) };
    for (const c of categories) out[c.id] = countOf({ categoryId: c.id });
    return out;
  }, [all, categories, countOf]);

  const mediaCounts = useMemo(
    () => ({
      '': all.length,
      image: countOf({ media: 'image' }),
      video: countOf({ media: 'video' }),
      text: countOf({ media: 'text' }),
    }),
    [all, countOf],
  );

  const publishedCounts = useMemo(
    () => ({
      '': all.length,
      yes: countOf({ published: 'yes' }),
      no: countOf({ published: 'no' }),
    }),
    [all, countOf],
  );

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

  const toggleSelect = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)));

  const clearFilters = () => {
    setQuery('');
    setCategoryFilter('');
    setMediaFilter('');
    setPublishedFilter('');
  };

  function openPublish(it: LibraryPost) {
    setPublishItem(it);
    setPublishOpen(true);
  }

  function menuFor(it: LibraryPost): MenuAction[] {
    const p = it.post;
    return [
      { label: 'תצוגה מקדימה', icon: '👁', onSelect: () => setPreviewItem(it) },
      { label: 'ערוך ותזמן בעורך', icon: '✏️', onSelect: () => router.push(`/social/posts/${p.id}`) },
      {
        label: 'שכפל לפוסט חדש',
        icon: '⧉',
        disabled: busy === `dup-${p.id}`,
        onSelect: async () => {
          setBusy(`dup-${p.id}`);
          try {
            const copy = await duplicatePost(p.id);
            toast('נוצר עותק כטיוטה.');
            router.push(`/social/posts/${copy.id}`);
          } catch (err) {
            toast(friendlyMessage(err, 'השכפול נכשל.'), 'error');
            setBusy(null);
          }
        },
      },
      {
        label: 'שנה קטגוריית תוכן',
        icon: '🏷',
        onSelect: () => {
          setSelected([p.id]);
          setAssignOpen(true);
        },
      },
      {
        label: 'העבר לארכיון',
        icon: '🗄',
        danger: true,
        onSelect: async () => {
          const ok = await confirm.ask({
            title: 'להעביר לארכיון?',
            body: 'תזמונים פעילים של הפוסט יבוטלו ופרסומים שטרם יצאו ידולגו. מה שכבר פורסם נשאר בהיסטוריה.',
            confirmLabel: 'העבר לארכיון',
            danger: true,
          });
          if (ok) await act(`arch-${p.id}`, () => archivePost(p.id), 'הפוסט הועבר לארכיון.');
        },
      },
    ];
  }


  return (
    <SocialShell
      title="ספריית תוכן"
      lede="פוסטים מוכנים לפרסום בלחיצה אחת"
      headerAction={
        <ButtonLink href="/social/posts/new">
          <PlusIcon className="h-4 w-4" strokeWidth={2.4} /> פוסט חדש
        </ButtonLink>
      }
    >
      <div className="space-y-4 pb-20">
        {error && (
          <div className="space-y-2">
            <Notice tone="error">{error}</Notice>
            <Button variant="secondary" onClick={load}>
              נסו שוב
            </Button>
          </div>
        )}
        {categoriesError && <Notice tone="warn">{categoriesError}</Notice>}
        {categorySchemaMissing && (
          <Notice tone="warn">
            הקטגוריות עדיין לא זמינות. פתחו את Supabase → SQL Editor והריצו פעם אחת את הקובץ{' '}
            <code dir="ltr" className="break-all">supabase/social-schema-v8.sql</code> מתוך הפרויקט. כל השאר בספרייה — החיפוש, הסינון והפרסום המהיר — עובד גם בלי זה.
          </Notice>
        )}
        {truncated && (
          <Notice tone="warn">
            מספרי הפרסומים מחושבים על {LIBRARY_USAGE_LIMIT} הפרסומים האחרונים בלבד, ולכן אצל פוסטים ותיקים הם עשויים להיות נמוכים מהאמת. ההיסטוריה המלאה נמצאת במסך היסטוריה.
          </Notice>
        )}

        {all.length > 0 && (
          <Card padded={false} className="p-3">
            <input
              type="search"
              className={inputClass}
              placeholder="חיפוש פוסט…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="חיפוש פוסט"
            />

            <div className="mt-2.5 min-w-0 space-y-2 overflow-x-auto scrollbar-none">
              <SegmentedControl
                size="sm"
                label="קטגוריית תוכן"
                value={categoryFilter}
                onChange={setCategoryFilter}
                className="min-w-max"
                options={[
                  { value: '', label: 'הכל', count: categoryCounts[''] },
                  ...categories.map((c) => ({
                    value: c.id,
                    label: <span dir="auto">{c.name}</span>,
                    count: categoryCounts[c.id] ?? 0,
                  })),
                  { value: UNCATEGORISED, label: 'ללא קטגוריה', count: categoryCounts[UNCATEGORISED] ?? 0 },
                ]}
              />
              <SegmentedControl
                size="sm"
                label="סוג תוכן"
                value={mediaFilter}
                onChange={setMediaFilter}
                className="min-w-max"
                options={[
                  { value: '', label: 'הכל', count: mediaCounts[''] },
                  { value: 'image', label: 'תמונות', count: mediaCounts.image },
                  { value: 'video', label: 'סרטונים', count: mediaCounts.video },
                  { value: 'text', label: 'טקסט בלבד', count: mediaCounts.text },
                ]}
              />
              <SegmentedControl
                size="sm"
                label="פרסום"
                value={publishedFilter}
                onChange={setPublishedFilter}
                className="min-w-max"
                options={[
                  { value: '', label: 'הכל', count: publishedCounts[''] },
                  { value: 'yes', label: 'כבר פורסמו', count: publishedCounts.yes },
                  { value: 'no', label: 'טרם פורסמו', count: publishedCounts.no },
                ]}
              />
              <SegmentedControl
                size="sm"
                label="סדר"
                value={sort}
                onChange={setSort}
                className="min-w-max"
                options={[
                  { value: 'newest', label: 'חדשים' },
                  { value: 'oldest', label: 'ישנים' },
                  { value: 'most', label: 'הכי מפורסמים' },
                  { value: 'recent', label: 'פורסמו לאחרונה' },
                ]}
              />
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <div className="flex flex-wrap gap-3">
                <button type="button" className="min-h-10 px-1 text-brand-400" onClick={() => setSelected(visible.map((it) => it.post.id))}>
                  {visible.length === 1 ? 'בחר את הפוסט המוצג' : `בחר את כל ${visible.length} המוצגים`}
                </button>
                {selected.length > 0 && (
                  <button type="button" className="min-h-10 px-1 text-mist-500" onClick={() => setSelected([])}>
                    נקה בחירה
                  </button>
                )}
              </div>
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-1.5 px-1 text-brand-400"
                onClick={() => {
                  setRenames({});
                  setNewCategory('');
                  setManageOpen(true);
                }}
              >
                <TagIcon className="h-4 w-4" /> נהל קטגוריות
              </button>
            </div>
          </Card>
        )}

        {/* Loading: cards, not a spinner, so the grid does not jump when it fills. */}
        {!items && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 [&>*]:min-w-0" aria-busy="true" aria-label="טוען…">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-60 rounded-2xl" />
            ))}
          </div>
        )}

        {items && all.length === 0 && !error && (
          <EmptyState
            icon={<ClipboardListIcon className="h-5 w-5" />}
            title="הספרייה עדיין ריקה"
            description="פוסט הוא הטקסט, התמונות והסרטונים שיוצאים לקבוצות. ברגע שיהיה כאן פוסט אחד, אפשר יהיה לשלוח אותו לעשרות קבוצות בלי לפתוח אותו שוב."
            action={
              <ButtonLink href="/social/posts/new" size="lg">
                צור פוסט ראשון
              </ButtonLink>
            }
          />
        )}

        {items && all.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={<SearchIcon className="h-5 w-5" />}
            title="אין פוסטים בסינון הזה"
            description="נסו לנקות את החיפוש או לבחור 'הכל'."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                נקה סינון
              </Button>
            }
          />
        )}

        {page.length > 0 && (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 [&>*]:min-w-0">
            {page.map((it) => (
              <ContentCard
                key={it.post.id}
                item={it}
                selected={selected.includes(it.post.id)}
                onSelect={toggleSelect}
                onPublish={openPublish}
                onOpen={(x) => router.push(`/social/posts/${x.post.id}`)}
                actions={menuFor(it)}
                categoryName={categoryName(it.categoryId)}
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
              מוצגים {page.length} מתוך {visible.length}. הסינון והבחירה עובדים על כולם.
            </p>
          </div>
        )}
      </div>

      {/* Selection bar. data-overlay keeps the page's entrance transform off it —
          a transformed ancestor becomes the containing block for `fixed`. */}
      {selected.length > 0 && (
        <div data-overlay className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-ink-850 p-2.5 shadow-2xl ring-1 ring-ink-600">
            <Badge tone="brand">נבחרו {selected.length}</Badge>
            <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
              קטגוריה
            </Button>
            <Button
              size="sm"
              variant="danger"
              busy={busy === 'bulk-archive'}
              onClick={async () => {
                const ok = await confirm.ask({
                  title: `להעביר ${postsLabel(selected.length)} לארכיון?`,
                  body: 'תזמונים פעילים שלהם יבוטלו ופרסומים שטרם יצאו ידולגו. מה שכבר פורסם נשאר בהיסטוריה.',
                  confirmLabel: 'העבר לארכיון',
                  danger: true,
                });
                if (ok)
                  await act(
                    'bulk-archive',
                    async () => {
                      for (const id of selected) await archivePost(id);
                      setSelected([]);
                    },
                    selected.length === 1 ? 'הפוסט הועבר לארכיון.' : 'הפוסטים הועברו לארכיון.',
                  );
              }}
            >
              ארכיון
            </Button>
            <button type="button" className="ms-auto min-h-9 px-2 text-xs font-bold text-mist-500" onClick={() => setSelected([])}>
              בטל
            </button>
          </div>
        </div>
      )}

      {/* Quick publish: the reason this screen exists. */}
      <QuickPublishSheet
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        item={publishItem}
        onDone={load}
        onTune={() => setTunerOpen(true)}
      />

      {/* The live tuner already owns "change the interval / add groups" once the
          queue exists, so this screen hands over to it rather than re-building it. */}
      <QueueTunerSheet
        open={tunerOpen}
        onClose={() => setTunerOpen(false)}
        campaignId={publishItem?.post.campaign_id ?? undefined}
        onChanged={load}
      />

      {/* Assigning a content category to the selection. */}
      <Sheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`קטגוריית תוכן ל${selected.length === 1 ? 'פוסט אחד' : `-${selected.length} פוסטים`}`}
      >
        {categorySchemaMissing ? (
          <p className="text-sm text-mist-300">
            הקטגוריות עדיין לא זמינות — צריך להריץ פעם אחת את <code dir="ltr" className="break-all">supabase/social-schema-v8.sql</code> ב-SQL Editor של Supabase.
          </p>
        ) : categories.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-mist-300">עדיין אין קטגוריות תוכן. צרו אחת כדי לסדר את הספרייה.</p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setAssignOpen(false);
                setManageOpen(true);
              }}
            >
              נהל קטגוריות
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setAssignOpen(false);
                  act('assign', () => setPostCategory(selected, c.id).then(() => setSelected([])), `הפוסטים סווגו כ-"${c.name}".`);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-ink-600 px-3 text-start text-sm font-bold text-mist-100"
              >
                <span dir="auto" className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 tabular-nums text-mist-500">{categoryCounts[c.id] ?? 0}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setAssignOpen(false);
                act('assign', () => setPostCategory(selected, null).then(() => setSelected([])), 'הקטגוריה הוסרה מהפוסטים.');
              }}
              className="flex min-h-11 w-full items-center rounded-xl border border-ink-600 px-3 text-start text-sm font-bold text-mist-500"
            >
              ללא קטגוריה
            </button>
          </div>
        )}
      </Sheet>

      {/* Creating / renaming / deleting categories, without leaving the library. */}
      <Sheet open={manageOpen} onClose={() => setManageOpen(false)} title="קטגוריות תוכן" size="lg">
        <p className="text-sm text-mist-500">
          הקטגוריות כאן הן של הפוסטים. הקטגוריה שבמסך הקבוצות היא דבר אחר — היא מתארת את הקבוצות עצמן.
        </p>

        {categorySchemaMissing && (
          <div className="mt-3">
            <Notice tone="warn">
              אי אפשר עדיין ליצור קטגוריה: הטבלה שלה לא קיימת במסד הנתונים. פתחו את Supabase → SQL Editor והריצו את{' '}
              <code dir="ltr" className="break-all">supabase/social-schema-v8.sql</code>, ואז חזרו לכאן.
            </Notice>
          </div>
        )}

        <form
          className="mt-3 flex min-w-0 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newCategory.trim();
            if (!name) return;
            act('cat-new', () => saveCategory({ name }).then(() => setNewCategory('')), `הקטגוריה "${name}" נוספה.`);
          }}
        >
          <div className="min-w-0 grow">
            <Field label="קטגוריה חדשה" hint="למשל: ספות, מזגנים, לפני ואחרי, המלצות.">
              <input className={inputClass} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="שם הקטגוריה" />
            </Field>
          </div>
          <Button type="submit" busy={busy === 'cat-new'} disabled={!newCategory.trim() || categorySchemaMissing}>
            הוסף
          </Button>
        </form>

        {categories.length === 0 && <p className="mt-4 text-sm text-mist-500">עדיין אין קטגוריות.</p>}

        <ul className="mt-4 space-y-2">
          {categories.map((c) => {
            const draft = renames[c.id] ?? c.name;
            const changed = draft.trim() !== c.name && draft.trim().length > 0;
            return (
              <li key={c.id} className="flex min-w-0 items-center gap-2">
                <label className="min-w-0 grow">
                  <input
                    className={inputClass}
                    aria-label={`שם הקטגוריה ${c.name}`}
                    value={draft}
                    onChange={(e) => setRenames((r) => ({ ...r, [c.id]: e.target.value }))}
                  />
                </label>
                <span className="shrink-0 text-xs font-bold tabular-nums text-mist-500">{categoryCounts[c.id] ?? 0}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!changed}
                  busy={busy === `cat-${c.id}`}
                  onClick={() => act(`cat-${c.id}`, () => saveCategory({ id: c.id, name: draft.trim() }), 'השם עודכן.')}
                >
                  שמור
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  busy={busy === `catdel-${c.id}`}
                  onClick={async () => {
                    const ok = await confirm.ask({
                      title: `למחוק את "${c.name}"?`,
                      body: 'הפוסטים עצמם נשארים — הם פשוט יחזרו להיות בלי קטגוריה.',
                      confirmLabel: 'מחק קטגוריה',
                      danger: true,
                    });
                    if (ok) await act(`catdel-${c.id}`, () => deleteCategory(c.id), 'הקטגוריה נמחקה. הפוסטים נשארו.');
                  }}
                >
                  מחק
                </Button>
              </li>
            );
          })}
        </ul>
      </Sheet>


      {/* How the post will look in the feed — the editor's own preview component,
          so the two screens cannot show two different things. */}
      <Sheet open={Boolean(previewItem)} onClose={() => setPreviewItem(null)} title="תצוגה מקדימה" size="lg">
        {previewItem && (
          <div className="space-y-3">
            <PostPreview
              pageName={businessName}
              text={previewItem.post.base_text}
              media={previewItem.post.media}
              link={previewItem.post.link_url}
              cta={previewItem.post.cta_type}
            />
            <p className="text-xs text-mist-500">
              כך ייראה הפוסט בערך בפיד. אם יש לפוסט גרסאות מאושרות, כל קבוצה עשויה לקבל נוסח אחר — הנוסח הבסיסי הוא מה שמוצג כאן.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                const it = previewItem;
                setPreviewItem(null);
                openPublish(it);
              }}
            >
              פרסם את הפוסט הזה
            </Button>
          </div>
        )}
      </Sheet>

      {confirm.dialog}
    </SocialShell>
  );
}
