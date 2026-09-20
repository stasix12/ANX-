'use client';

import { useEffect, useMemo, useState } from 'react';
import { StarIcon } from '@/components/icons';
import { detectCity, sortCities } from '@/lib/social/cities';
import { agree, counted } from '@/lib/social/time';
import { type SocialTarget, type Variant } from '@/lib/social/types';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button, MethodBadge, SegmentedControl, inputClass } from './ui';

/**
 * Choosing who receives the post. With a hundred-plus groups the useful unit
 * is not the individual tile but the set — "all of Be'er Sheva", "everything
 * starred", "everything active" — so those are one tap each and the list
 * below is for the exceptions.
 *
 * Test mode caps the number of groups; the cap is enforced here and stated
 * rather than silently swallowing taps.
 */
/*
 * How many target rows are drawn at once. Selection, the quick sets and the
 * counts all work over the whole filtered list; only the drawing is capped,
 * so a few hundred groups do not turn the post editor sluggish.
 */
const CHUNK = 60;

export function TargetPicker({
  targets,
  selected,
  onChange,
  variants = [],
  variantMap = {},
  onVariantMap,
  maxSelectable,
  note,
}: {
  targets: SocialTarget[];
  selected: string[];
  onChange: (ids: string[]) => void;
  variants?: Variant[];
  variantMap?: Record<string, string>;
  onVariantMap?: (map: Record<string, string>) => void;
  /** Test mode: at most this many group targets. */
  maxSelectable?: number;
  note?: string;
}) {
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState<'all' | 'facebook_group'>('all');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [shown, setShown] = useState(CHUNK);

  const cityOf = (t: SocialTarget) => t.city || detectCity(t.name);
  const cities = useMemo(() => sortCities(targets.filter((t) => t.channel === 'facebook_group').map(cityOf)), [targets]);
  const categories = useMemo(
    () => Array.from(new Set(targets.map((t) => t.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'he')),
    [targets],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter(
      (t) =>
        (channel === 'all' || t.channel === channel) &&
        (!city || cityOf(t) === city) &&
        (!category || (t.category || '') === category) &&
        (!q || t.name.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, query, channel, city, category]);

  /* Drawn slice. `visible` stays the real filtered set everything else uses. */
  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);

  /* A new filter means a new list, so start from the top again. */
  useEffect(() => {
    setShown(CHUNK);
  }, [query, channel, city, category]);

  const approved = variants.filter((v) => v.approval === 'approved');
  // 125 identical "בסיוע דפדפן" chips say nothing; the badge earns its place
  // only when the visible list holds both pages and groups.
  const mixedChannels = new Set(visible.map((t) => t.channel)).size > 1;
  const groupCount = (ids: string[]) => ids.filter((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group').length;
  const atCap = maxSelectable !== undefined && groupCount(selected) >= maxSelectable;

  function toggle(id: string, on: boolean) {
    if (!on) return onChange(selected.filter((x) => x !== id));
    const next = [...selected, id];
    if (maxSelectable !== undefined && groupCount(next) > maxSelectable) return;
    onChange(next);
  }

  /** Trims a candidate list to the test-mode cap rather than refusing it whole. */
  function capped(ids: string[]): string[] {
    if (maxSelectable === undefined || groupCount(ids) <= maxSelectable) return ids;
    const groups = ids.filter((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group').slice(0, maxSelectable);
    return ids.filter((id) => targets.find((t) => t.id === id)?.channel !== 'facebook_group').concat(groups);
  }

  const enabledIds = (items: SocialTarget[]) => items.filter((t) => t.enabled).map((t) => t.id);
  /** "Only Be'er Sheva" means only Be'er Sheva — it replaces, it does not merge. */
  const only = (items: SocialTarget[]) => onChange(capped(enabledIds(items)));
  const also = (items: SocialTarget[]) => onChange(capped(Array.from(new Set([...selected, ...enabledIds(items)]))));

  /*
   * Selected targets the current filter hides. Without this the picker could
   * strand a selection out of sight: pick "all of Be'er Sheva" while a post
   * still carried Arad from an earlier campaign and the Arad groups stayed
   * selected, off-screen, with no checkbox to clear them.
   */
  const hiddenSelected = selected.filter((id) => !visible.some((t) => t.id === id));

  /*
   * `label` is the accessible name of the "+" button beside each set, so it
   * has to be words: with the star inside it VoiceOver announced the
   * favourites set as "white medium star מועדפות". The mark is an icon now,
   * and it is drawn, not spoken.
   */
  const quickSets: { label: string; icon?: React.ReactNode; items: SocialTarget[] }[] = [
    { label: city || 'כל המוצגים', items: visible },
    { label: 'מועדפות', icon: <StarIcon className="h-3.5 w-3.5" fill="currentColor" />, items: targets.filter((t) => t.favorite) },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="min-w-0 space-y-3">
      <input type="search" className={inputClass} placeholder="חיפוש יעד…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="חיפוש יעד" />

      <div className="min-w-0 space-y-2 overflow-x-auto scrollbar-none">
        <SegmentedControl
          size="sm"
          label="סוג יעד"
          value={channel}
          onChange={setChannel}
          className="min-w-max"
          options={[
            { value: 'all', label: 'הכל', count: targets.length },
            { value: 'facebook_group', label: 'קבוצות', count: targets.filter((t) => t.channel === 'facebook_group').length },
          ]}
        />
        {cities.length > 1 && (
          <SegmentedControl
            size="sm"
            label="עיר"
            value={city}
            onChange={setCity}
            className="min-w-max"
            options={[
              { value: '', label: 'כל הערים' },
              ...cities.map((c) => ({ value: c, label: c, count: targets.filter((t) => t.channel === 'facebook_group' && cityOf(t) === c).length })),
            ]}
          />
        )}
        {categories.length > 0 && (
          <SegmentedControl
            size="sm"
            label="קטגוריה"
            value={category}
            onChange={setCategory}
            className="min-w-max"
            options={[{ value: '', label: 'כל הקטגוריות' }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {quickSets.map((q) => (
          <span key={q.label} className="inline-flex overflow-hidden rounded-xl">
            <Button size="sm" variant="secondary" className="!rounded-none" onClick={() => only(q.items)}>
              {q.icon}רק {q.label} ({q.items.length})
            </Button>
            {selected.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                aria-label={`הוסף את ${q.label} לבחירה הקיימת`}
                title={`הוסף את ${q.label} לבחירה הקיימת`}
                className="!rounded-none border-s border-ink-600 !px-2.5"
                onClick={() => also(q.items)}
              >
                +
              </Button>
            )}
          </span>
        ))}
        {selected.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            נקה הכל
          </Button>
        )}
        <span className="ms-auto">
          <Badge tone={selected.length ? 'brand' : 'neutral'}>
            {agree(selected.length, 'נבחר', 'נבחרו')} {selected.length}
          </Badge>
        </span>
      </div>

      {hiddenSelected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning-400/30 bg-warning-400/12 px-3 py-2">
          <span className="text-xs font-bold text-warning-400">
            {counted(hiddenSelected.length, 'יעד אחד שנבחר אינו מוצג', 'יעדים נבחרים לא מוצגים', 'שני יעדים נבחרים לא מוצגים')} בסינון
            הנוכחי
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ms-auto"
            onClick={() => {
              setCity('');
              setCategory('');
              setChannel('all');
              setQuery('');
            }}
          >
            הצג אותם
          </Button>
          <Button size="sm" variant="danger" onClick={() => onChange(selected.filter((id) => visible.some((t) => t.id === id)))}>
            הסר אותם
          </Button>
        </div>
      )}

      {note && <p className="text-xs font-bold text-warning-400">{note}</p>}
      {atCap && !note && <p className="text-xs text-warning-400">הגעתם למגבלת הקבוצות של מצב הבדיקה.</p>}
      {visible.length === 0 && <p className="text-sm text-mist-500">אין יעדים תואמים לסינון.</p>}

      <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {page.map((t) => {
          const on = selected.includes(t.id);
          const blocked = !on && atCap && t.channel === 'facebook_group';
          return (
            <li
              key={t.id}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                on ? 'border-brand-300 bg-brand-300/8' : 'border-ink-600'
              } ${!t.enabled || blocked ? 'opacity-50' : ''}`}
            >
              {/* The label covers the identity only — the variant select sits
                  outside it, or clicking the dropdown would toggle the row. */}
              {/* min-h-11: this row is tapped once per group when choosing
                  targets, and it measured 287x42.5 around a 20x20 checkbox —
                  1.5px under the floor, while GroupCard and the library card
                  wrap the identical checkbox in a full 44x44 label. */}
              <label className="flex min-h-11 min-w-0 grow cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-brand-300"
                  checked={on}
                  disabled={blocked}
                  onChange={(e) => toggle(t.id, e.target.checked)}
                  aria-label={t.name}
                />
                <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={36} />
                <div className="min-w-0 grow">
                  {/* dir="auto" so an LTR name (Беэр-Шева…) truncates at its own
                      end; inside an RTL box it was being clipped at the START, which
                      made every Russian group render as the same "…и Негев". */}
                  <p dir="auto" className="truncate text-sm font-bold text-mist-100">
                    {t.favorite && (
                      <>
                        {/* The checkbox beside this row carries the name as
                            its accessible name, so the mark has to say itself
                            — an aria-hidden star was silent on the one flag
                            that changes how the list is used. */}
                        <span className="sr-only">מועדפת. </span>
                        <StarIcon className="me-1 inline h-3.5 w-3.5 align-[-1px] text-warning-400" fill="currentColor" aria-hidden />
                      </>
                    )}
                    {t.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {mixedChannels && <MethodBadge channel={t.channel} />}
                    {!t.enabled && <Badge tone="neutral">כבוי</Badge>}
                  </div>
                </div>
              </label>
              {on && onVariantMap && approved.length > 0 && (
                <select
                  aria-label={`גרסה עבור ${t.name}`}
                  /* Was ~26px tall at text-xs: under the tap floor, and small
                     enough text that iOS Safari zooms the page on focus. */
                  className="min-h-11 max-w-28 shrink-0 rounded-xl border border-ink-600 bg-ink-900 px-2 py-1 text-base text-mist-100"
                  value={variantMap[t.id] ?? ''}
                  onChange={(e) => {
                    const next = { ...variantMap };
                    if (e.target.value) next[t.id] = e.target.value;
                    else delete next[t.id];
                    onVariantMap(next);
                  }}
                >
                  <option value="">אוטומטי</option>
                  {approved.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      {visible.length > page.length && (
        <div className="flex flex-col items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => setShown((n) => n + CHUNK)}>
            הצג עוד {Math.min(CHUNK, visible.length - page.length)}
          </Button>
          <p className="text-[11px] text-mist-500">
            מוצגים {page.length} מתוך {visible.length}. &quot;רק…&quot; ו-&quot;+&quot; פועלים על כל {visible.length}.
          </p>
        </div>
      )}
    </div>
  );
}
