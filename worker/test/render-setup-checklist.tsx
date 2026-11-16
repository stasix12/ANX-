/*
 * ─── THE FIRST THING A NEW ACCOUNT SEES, MEASURED IN RUSSIAN ──────────────
 *
 * SetupChecklist has never been measured in Russian, and it is the one card
 * in this product that exists ONLY for a brand-new install: it removes itself
 * for good the moment the first publication reaches the queue. So the empty
 * states here are not an edge case — they are the entire component.
 *
 * The real component with the real compiled Tailwind, through
 * renderToStaticMarkup. Anything hand-written would be measuring a copy, and
 * a copy is what stops failing when the component changes.
 *
 * HOW THE PROPS ARE BUILT. One call site:
 *
 *   src/app/social/page.tsx:1877
 *     <SetupChecklist
 *       hasTargets={(data.activeTargets ?? 0) > 0}
 *       workerOnline={data.workerOnline}
 *       hasPublications={summary.total > 0}
 *     />
 *
 * Three booleans, nothing else — no field names to invent. The component is
 * pure (no hooks at all), so renderToStaticMarkup gives the whole of it: every
 * branch below is the real markup the app paints.
 *
 * ─── WHICH SHAPES, AND WHY ALL OF THEM ───────────────────────────────────
 *
 * Eight combinations exist; `hasPublications` collapses four of them to
 * `return null`, and the remaining four are the only states a new owner can
 * be in. Every one is rendered, because WHICH step is undone decides which
 * step gets the button, and the button is the widest box here:
 *
 *   · NOTHING DONE — the cold install, the state the card was written for.
 *     Step 1 carries the only call to action: "להוספת קבוצות" → "Для
 *     добавления групп" (13 → 20 characters, +54%), inside an
 *     `inline-flex min-h-11 … px-4` pill that has 24px of marker and 12px of
 *     gap taken out of a 320px phone before it starts.
 *   · GROUPS ADDED, PC STILL OFF — step 2 is next, and step 2 is the longest
 *     body in the card: the April-2024 paragraph, 152 Hebrew characters
 *     against 193 Russian (+27%), with unbreakable tokens in it
 *     ("start-worker.cmd", "Chrome") that have nowhere to wrap.
 *     Its CTA is "למצב החיבור" → "К состоянию подключения" (11 → 23
 *     characters, +109% — the worst ratio in the card).
 *   · PC ON BEFORE GROUPS — reachable in one order of operations (a customer
 *     who double-clicks start-worker.cmd before pasting a single link), and
 *     it is the only state that draws a DONE step above an undone one: the
 *     green CheckIcon disc and the `sr-only` "— הושלם" → "— завершено" that
 *     goes with it.
 *   · GROUPS AND PC BOTH DONE — two green discs, two `text-success-400`
 *     titles, and the third CTA "לפוסט חדש" → "К новому посту". The tallest
 *     the card gets.
 *   · AND THE REMOVAL: hasPublications true. It draws nothing at all, which
 *     is the behaviour worth having on the page — a card that is supposed to
 *     disappear and instead leaves an empty bordered box behind is a
 *     regression a width measurement would otherwise never see.
 *
 * Every string in the card is a fixed sentence — there is no interpolated
 * data in this component, no counts and no names — so these five renders are
 * the complete set of shapes it can take. Nothing here touches the network,
 * Facebook or a database.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
import { SetupChecklist } from '@/components/social/SetupChecklist';

const CASES: [string, { hasTargets: boolean; workerOnline: boolean; hasPublications: boolean }][] = [
  ['a cold install — nothing done, step 1 has the button', { hasTargets: false, workerOnline: false, hasPublications: false }],
  ['groups added, the PC still off — step 2 has the button', { hasTargets: true, workerOnline: false, hasPublications: false }],
  ['the PC started before any group was added — a done step above an undone one', { hasTargets: false, workerOnline: true, hasPublications: false }],
  ['groups and PC both done — two green steps, step 3 has the button', { hasTargets: true, workerOnline: true, hasPublications: false }],
  ['the first publication exists — the card removes itself and must leave nothing behind', { hasTargets: true, workerOnline: true, hasPublications: true }],
];

const body = CASES.map(
  ([label, props]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="checklist-probe mb-4">${renderSnapshot(createElement(SetupChecklist, props))}</div>`,
).join('');

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">${body}</main>
</div>
</body></html>`,
);
