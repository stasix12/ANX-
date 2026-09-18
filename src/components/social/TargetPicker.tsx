'use client';

import { useMemo, useState } from 'react';
import { detectCity, sortCities } from '@/lib/social/cities';
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
  const [channel, setChannel] = useState<'all' | 'facebook_page' | 'facebook_group'>('all');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');

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

  const quickSets = [
    { label: city || 'כל המוצגים', items: visible },
    { label: '⭐ מועדפות', items: targets.filter((t) => t.favorite) },
    { label: 'דפים', items: targets.filter((t) => t.channel === 'facebook_page') },
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
            { value: 'facebook_page', label: 'דפים', count: targets.filter((t) => t.channel === 'facebook_page').length },
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
              רק {q.label} ({q.items.length})
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
          <Badge tone={selected.length ? 'brand' : 'neutral'}>נבחרו {selected.length}</Badge>
        </span>
      </div>

      {hiddenSelected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <span className="text-xs font-bold text-amber-900">
            {hiddenSelected.length} יעדים נבחרים לא מוצגים בסינון הנוכחי
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

      {note && <p className="text-xs font-bold text-amber-700">{note}</p>}
      {atCap && !note && <p className="text-xs text-amber-700">הגעתם למגבלת הקבוצות של מצב הבדיקה.</p>}
      {visible.length === 0 && <p className="text-sm text-mist-500">אין יעדים תואמים לסינון.</p>}

      <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => {
          const on = selected.includes(t.id);
          const blocked = !on && atCap && t.channel === 'facebook_group';
          return (
            <li
              key={t.id}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                on ? 'border-brand-500 bg-brand-500/5' : 'border-ink-600'
              } ${!t.enabled || blocked ? 'opacity-50' : ''}`}
            >
              {/* The label covers the identity only — the variant select sits
                  outside it, or clicking the dropdown would toggle the row. */}
              <label className="flex min-w-0 grow cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-brand-500"
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
                    {t.favorite && <span aria-hidden>⭐ </span>}
                    {t.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {mixedChannels && <MethodBadge channel={t.channel} />}
                    {!t.enabled && <Badge tone="neutral">כבוי</Badge>}
                    {t.channel === 'facebook_page' && !t.can_api_publish && <Badge tone="warn">אין הרשאה</Badge>}
                  </div>
                </div>
              </label>
              {on && onVariantMap && approved.length > 0 && (
                <select
                  aria-label={`גרסה עבור ${t.name}`}
                  className="max-w-24 shrink-0 rounded-lg border border-ink-600 bg-ink-850 px-1.5 py-1 text-xs text-mist-100"
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
    </div>
  );
}
