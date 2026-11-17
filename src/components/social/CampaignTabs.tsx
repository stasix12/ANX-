'use client';

import Link from 'next/link';

/**
 * ─── THE ROW OF TABS ABOVE THE COUNTERS ───────────────────────────────────
 *
 * "לשחזר את מבנה הכותרת, הטאבים, המונים, שורת החיפוש…" — the reference draws
 * two rows under the top bar and they are not the same thing: THIS one is
 * four names with a hairline between them and a blue underline under the one
 * you are on, and the one below it is the filter with its counts.
 *
 * WHY IT IS NOT StatStrip. The strip this row replaces on the campaigns
 * screen is also on the dashboard (src/app/social/page.tsx:1955) and is
 * measured there by stat-strip.test.ts — four equal columns, three inset
 * dividers, one outer border. Restyling it would redraw a screen this brief
 * does not include. So the campaigns screen gets its own row and the strip
 * stays exactly what it is everywhere else.
 *
 * WHAT IT KEEPS FROM THE STRIP: the four destinations. Each name is still the
 * link it was, so nothing on this screen became unreachable — and each one
 * carries its own figure in its accessible name, because the reference prints
 * no numbers here and a count that is read out loud is better than a count
 * that is gone. The two that matter most are printed in full by the filter
 * row immediately below (סה״כ and פעילים).
 */
export type CampaignTabItem = {
  key: string;
  /** The word on screen. Already translated by the caller. */
  label: string;
  /** Where it goes. The same href the strip used. */
  href: string;
  /** Its figure, for the accessible name only — the reference prints none. */
  value?: number | string;
  /**
   * WHAT IT DOES WHEN IT IS ALREADY HERE. Two of the four point at this very
   * screen, which the strip they replace did too — a link to the page you are
   * on moves nothing. Given one of these they also set the list's filter, so
   * every name in the row answers a tap. The underline does not follow it:
   * the reference draws the underline on the SCREEN you are on and the filled
   * chip in the row below on the FILTER, and those are two different things.
   */
  onSelect?: () => void;
};

export function CampaignTabs({
  items,
  activeKey,
  label,
}: {
  items: CampaignTabItem[];
  /** Which one is the screen you are on. */
  activeKey: string;
  /** The row's own name, for a screen reader. */
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex items-stretch rounded-2xl border border-ink-700 bg-ink-900 px-1 shadow-[0_1px_2px_rgba(40,20,80,0.03),0_6px_18px_rgba(40,20,80,0.05)]"
    >
      {items.map((item, i) => {
        const active = item.key === activeKey;
        const first = i === 0;
        const last = i === items.length - 1;
        return (
          <div key={item.key} className="flex min-w-0 basis-0 grow items-stretch">
            {/* The hairline belongs to the item that follows, so the row's
                outer edges stay clean whatever the count. */}
            {i > 0 && <span aria-hidden className="my-2.5 w-px shrink-0 bg-ink-700" />}
            <Link
              href={item.href}
              onClick={item.onSelect}
              aria-current={active ? 'page' : undefined}
              /* The figure is said, not drawn — see the note at the head. */
              aria-label={item.value === undefined ? undefined : `${item.label} — ${item.value}`}
              /* THE ONES YOU ARE NOT ON ARE NOT GREYED OUT. The reference
                 prints all four in the same near-black ink and tells them
                 apart by the blue and the underline, not by fading three of
                 them: sampled off the image, an inactive name's darkest pixel
                 is rgb(2,1,1) — the body ink, not a secondary grey. */
              className={`relative flex min-h-11 min-w-0 grow items-center justify-center px-1 text-center text-[13px] leading-tight transition-colors ${
                active ? 'font-extrabold text-brand-400' : 'font-bold text-mist-100'
              }`}
            >
              {/* dir="auto" because layout.test.ts holds every truncated
                  expression to it: a name that is not Hebrew clips at the
                  wrong end in an RTL box. These four are the product's own
                  words, so it resolves to rtl and nothing moves. */}
              <span dir="auto" className="truncate">{item.label}</span>
              {/* THE UNDERLINE SITS ON THE CARD'S EDGE, which is where the
                  reference draws it: it is the bottom of the white row, not a
                  rule under the word. Inset on the side that meets a hairline
                  so it reads as the tab's own mark rather than a border
                  between two of them — and FLUSH on the side that meets the
                  row's own edge, which is how the reference draws the one it
                  marks: its underline runs x1044–1338 under a tab whose box
                  ends at 1336 and whose hairline stands at 1018. */}
              {active && (
                <span
                  aria-hidden
                  className={`absolute -bottom-px h-[3px] rounded-full bg-brand-500 ${
                    first ? 'start-0 end-2' : last ? 'start-2 end-0' : 'inset-x-2'
                  }`}
                />
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
