/*
 * THE TARGET PICKER'S QUICK-SET ROW, as a page a browser can measure.
 *
 * The row gained a third button per set ("−") and its first chip now names the
 * category as well as the city, so the longest chip this screen can draw went
 * from "רק באר שבע (138)" to "רק באר שבע · דוברי רוסית (138) + −". Whether
 * that still fits a 360px phone is a question about pixels, and the one rule
 * this module does not bend is "אין ליצור Horizontal Overflow".
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TargetPicker } from '@/components/social/TargetPicker';
import type { SocialTarget } from '@/lib/social/types';

const mk = (i: number, city: string, category: string | null): SocialTarget =>
  ({
    id: `t${i}`,
    name: `קבוצה ${i} — ${city}`,
    url: `https://facebook.com/groups/${i}`,
    channel: 'facebook_group',
    enabled: true,
    favorite: i % 11 === 0,
    city,
    category,
  }) as SocialTarget;

/* The owner's own shape: two cities, one long category name, and more groups
   than the picker draws at once. */
const targets: SocialTarget[] = [
  ...Array.from({ length: 138 }, (_, i) => mk(i, 'באר שבע', i % 3 === 0 ? 'דוברי רוסית' : null)),
  ...Array.from({ length: 59 }, (_, i) => mk(200 + i, 'ערד', null)),
];

const body = renderToStaticMarkup(
  /* createElement, NOT a direct call: the picker holds its filters in useState
     and a component invoked as a plain function has no hook dispatcher. */
  createElement(TargetPicker, {
    targets,
    /* Something selected, so "+", "−" and "נקה הכל" are all drawn — the widest
       the row ever gets. */
    selected: targets.slice(0, 20).map((t) => t.id),
    onChange: () => {},
  } as never),
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px"><div class="picker-probe">${body}</div></div></body></html>`);
