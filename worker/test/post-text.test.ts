/**
 * EDITING THE TEXT HAS TO REACH THE PUBLICATIONS ALREADY WAITING.
 *
 * This is the version of "שינויים בהגדרות לא מתעדכנים מיידית" that actually
 * publishes the wrong thing. The planner FREEZES the rendered text onto each
 * queue row when it creates it, and the worker publishes that snapshot —
 * `item.rendered_text || renderPostText(...)`. So editing a post changed what
 * FUTURE rows would say and nothing about the ones already queued, while the
 * editor answered "הפוסט נשמר." The owner fixes a phone number, a price or a
 * typo, is told it is saved, and the old text goes out for days.
 *
 * Freezing is not the bug and must stay: a row has to publish without
 * re-deriving anything, and a row that rendered at publish time would change
 * under a round that is already going out. What was missing is that an edit
 * never reached the frozen copies.
 *
 * FOUR RULES, and three of them are about not making it worse:
 *
 *   1. text and dedupe_hash move together or neither moves. rules.ts catches
 *      the same content going out twice by that hash; a row whose text was
 *      updated and whose hash was not is invisible to the duplicate rule.
 *   2. only rows that have NOT started. Not 'publishing' or
 *      'awaiting_confirmation', where the Post button may already have been
 *      pressed; not 'manual_pending', where a person may have the old text in
 *      front of them; not 'needs_attention', which can be a row already live.
 *   3. the status is re-asserted in the UPDATE, so a row the worker claims
 *      between the read and the write is not rewritten under it.
 *   4. a failure is reported, not thrown — the POST is already saved, and
 *      "השמירה נכשלה" would be false in the other direction.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPostText, dedupeKey } from '@/lib/social/compose';
import { TERMINAL_STATUSES, IN_FLIGHT_STATUSES } from '@/lib/social/status';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const client = src('../../src/lib/social/client.ts');
const fn = client.slice(client.indexOf('export async function refreshQueuedText'), client.indexOf("Copies a post with its variants"));

/* ───── 1. the arithmetic the refresh depends on, run for real ──────────── */
{
  const post = { base_text: 'התקשרו 03-1111111', phone: '03-1111111', whatsapp_url: '' };
  const edited = { base_text: 'התקשרו 03-2222222', phone: '03-2222222', whatsapp_url: '' };

  const before = renderPostText(post, null);
  const after = renderPostText(edited, null);
  is(before !== after, 'renderPostText must actually differ when the text is edited — the refresh skips rows whose text is unchanged, so if this were equal nothing would ever be rewritten');

  /* And the hash moves with it, which is the whole of rule 1. */
  const h1 = dedupeKey('group-7', before, ['a.jpg']);
  const h2 = dedupeKey('group-7', after, ['a.jpg']);
  is(h1 !== h2, 'the dedupe key must change with the text, which is why both columns have to be written together');
  eq(dedupeKey('group-7', after, ['a.jpg']), dedupeKey('group-7', after, ['a.jpg']), 'and it must be deterministic, or every save would look like a change');

  /* A variant that has since been deleted falls back to the base text — the
     same thing the planner writes for a row with no variant. */
  eq(renderPostText(edited, { text: '' }), renderPostText(edited, null), 'a deleted variant must fall back to the base text, which is what the planner itself writes for a row with no variant');
}

/* ───────── 2. only rows that have not started are touched ──────────────── */
{
  is(fn.length > 800, 'refreshQueuedText is found');
  is(/export const TEXT_EDITABLE_STATUSES: QueueStatus\[\] = \['scheduled', 'paused'\];/.test(client), "the set of rewritable statuses changed — it must be exactly the two that mean nothing has started");

  for (const started of [...IN_FLIGHT_STATUSES, 'manual_pending', 'needs_attention', 'awaiting_confirmation']) {
    is(
      !new RegExp(`TEXT_EDITABLE_STATUSES[^\\n]*'${started}'`).test(client),
      `'${started}' must never be rewritten: the Post button may already have been pressed, or a person is holding the old text`,
    );
  }
  for (const finished of TERMINAL_STATUSES) {
    is(!new RegExp(`'scheduled', 'paused'[^\\n]*'${finished}'`).test(client), `'${finished}' is history and must not be rewritten`);
  }

  is(/\.in\('status', TEXT_EDITABLE_STATUSES\)[\s\S]{0,200}\.order\('scheduled_at'\)/.test(fn), 'the read must narrow to those statuses');
  /* Twice: once in the read, and again in the UPDATE. */
  eq((fn.match(/\.in\('status', TEXT_EDITABLE_STATUSES\)/g) ?? []).length, 2, 'the status must be re-asserted in the UPDATE as well as the read — a row the worker claims in between must not be rewritten under it');
}

/* ───────── 3. both columns move, or neither does ───────────────────────── */
{
  is(
    /\.update\(\{ rendered_text: text, dedupe_hash: hash \}\)/.test(fn),
    'the text and the hash must be written in ONE update — a row whose text moved and whose hash did not is invisible to the duplicate-content rule',
  );
  is(
    /const hash = await sha256Hex\(dedupeKey\(row\.target_id, text, mediaUrls\)\);/.test(fn),
    'the hash must be computed from the NEW text and this row’s own group, exactly as the planner computes it',
  );
  /* The hash is computed BEFORE the update, so a refusal leaves the row alone
     rather than half-updated. sha256Hex throws outside a secure context by
     design, rather than writing an empty hash that disables the rule. */
  is(fn.indexOf('const hash = await sha256Hex') < fn.indexOf('.update({ rendered_text'), 'the hash must be computed before the write, so a hash that cannot be computed leaves the row untouched instead of half-updated');
  is(/text !== w\.row\.rendered_text/.test(fn), 'a row that already says the right thing must not be written at all');
}

/* ───────── 4. the editor stops saying the queue is up to date ──────────── */
{
  const editor = src('../../src/components/social/PostEditor.tsx');
  const save = code(editor.slice(editor.indexOf('async function onSave()'), editor.indexOf('async function onSchedule()')));
  is(save.length > 300, 'onSave is found');
  is(/queued = await refreshQueuedText\(id\);/.test(save), 'saving a post no longer reaches the publications already waiting — which is the whole defect');
  is(
    /try \{[\s\S]{0,120}refreshQueuedText\(id\);\s*\} catch \(err\) \{/.test(save),
    'and it must not throw: the POST is already saved by then, so reporting the save as failed would be false in the other direction',
  );
  is(/הפוסט נשמר, אבל הפרסומים שכבר ממתינים בתור/.test(save), 'a half-done save must say exactly which half happened');
  is(/לנוסח החדש/.test(save), 'and a successful one must say how many publications were updated — otherwise the owner has no way to know the queue followed');
  is(!/text: 'הפוסט נשמר\.' \}\);\s*\} catch/.test(code(save)), 'the bare "הפוסט נשמר." must no longer be the only thing a save can say');
}

console.log(`post-text OK — ${checks} assertions`);
