/*
 * THE TARGET PICKER, MOUNTED FOR REAL — the entry point picker.test.ts
 * bundles and drives.
 *
 * It replaced render-picker.tsx, which was renderToStaticMarkup, and that
 * swap is the point rather than a detail of it.
 *
 * "אני רוצה לפרסם את זה בכל הקבוצות אבל לא נותן לי למחוק קטגוריות רק (רק
 *  להוסיף) .. תטפל בזה כמה שצריך ותבדוק את עצמך הפעם."
 *
 * The old fixture rendered this component once, with no filter applied, and
 * measured the result. Nothing on this screen that depends on a FILTER BEING
 * CHOSEN could be seen by it — and "everything except this category" is
 * nothing but that: it exists only once a category is picked, and the only way
 * to pick one is to press a chip. A static render could not press anything, so
 * the whole half of this screen the owner was complaining about was outside
 * what any test here could look at. That is why a missing button could be
 * shipped and measured and still be missing.
 *
 * WHAT IT RECORDS. `window.__selected` is the id list the picker last handed
 * back — which is exactly what the post editor sends to the campaign — so the
 * test asks what the component EMITTED rather than reading ticks off the
 * screen. And `window.__targets` is the fixture's own data, so the expected
 * answer is derived from it rather than written out as a number that stops
 * being true the day the fixture changes.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TargetPicker } from '@/components/social/TargetPicker';
import type { SocialTarget } from '@/lib/social/types';

declare global {
  interface Window {
    __selected: string[];
    __targets: SocialTarget[];
  }
}

const RUSSIAN = 'דוברי רוסית';

const mk = (i: number, city: string, category: string | null, enabled = true): SocialTarget =>
  ({
    id: `t${i}`,
    name: `קבוצה ${i} — ${city}`,
    url: `https://facebook.com/groups/${i}`,
    channel: 'facebook_group',
    enabled,
    favorite: i % 11 === 0,
    city,
    category,
  }) as SocialTarget;

/*
 * THE OWNER'S OWN SHAPE, from the screenshot: two cities, one category, more
 * groups than the picker draws at once (CHUNK is 60) — so a set operation that
 * quietly worked on the drawn page rather than the whole filtered list would
 * come back with the wrong count here, which is the other way this row has
 * gone wrong before.
 *
 * AND ONE SWITCHED-OFF GROUP THAT IS NOT RUSSIAN-SPEAKING. It is the only
 * target that separates "every other group" from "every other group that can
 * actually publish", and those two answers differ by exactly one id — which is
 * the kind of difference a test with round numbers never notices.
 */
const targets: SocialTarget[] = [
  ...Array.from({ length: 138 }, (_, i) => mk(i, 'באר שבע', i % 3 === 0 ? RUSSIAN : null)),
  ...Array.from({ length: 59 }, (_, i) => mk(200 + i, 'ערד', null)),
  mk(999, 'ערד', null, false),
];
window.__targets = targets;
window.__selected = [];

function Harness() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div className="social-theme" style={{ padding: 16 }}>
      <TargetPicker
        targets={targets}
        selected={selected}
        onChange={(ids) => {
          window.__selected = ids;
          setSelected(ids);
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
