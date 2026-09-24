'use client';

import type { QueueRow } from '@/lib/social/client';
import { agree } from '@/lib/social/time';
import { Stamp } from './DateTime';
import { Card } from './ui';

/**
 * How the round's publications actually did, and — just as important — what
 * this screen refuses to claim.
 *
 * "How many people were exposed to the post" is the question a round is run to
 * answer, and it is the easiest place in this whole product to put a number
 * that is not true. Facebook publishes no reach or impressions figure for a
 * GROUP post, and Meta closed the Groups API in April 2024, so the only way to
 * produce one would be to add up the member counts of the groups posted to and
 * call that an audience. That number would be wrong by an order of magnitude
 * and it is exactly the number a paying customer would make decisions on — so
 * it does not exist here, and the card says why in one line rather than
 * leaving somebody to wonder where it went.
 *
 * What it shows instead is what Facebook itself puts on the post: its own
 * "seen by" count where it offers one, and reactions, comments and shares.
 * Every one of those is a real number about real people.
 *
 * NULL IS NOT ZERO, throughout. A post the worker has not read yet, a post
 * Facebook showed no "seen by" on, and a post nobody engaged with are three
 * different facts. Sums are taken only over rows that carry a number, and the
 * card says how many posts each sum covers — otherwise a round half-read
 * reports as a round half-ignored.
 */
export function CampaignReach({ rows, truncated = false }: { rows: QueueRow[]; truncated?: boolean }) {
  const published = rows.filter((r) => r.status === 'published');
  if (!published.length) return null;

  const sumOf = (pick: (r: QueueRow) => number | null | undefined) => {
    let total = 0;
    let posts = 0;
    for (const r of published) {
      const v = pick(r);
      if (typeof v === 'number') {
        total += v;
        posts += 1;
      }
    }
    return { total, posts };
  };

  const seen = sumOf((r) => r.metrics_seen);
  const reactions = sumOf((r) => r.metrics_reactions);
  const comments = sumOf((r) => r.metrics_comments);
  const shares = sumOf((r) => r.metrics_shares);
  const readAt = published
    .map((r) => r.metrics_at)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);

  return (
    <Card title="מה הפרסומים עשו" subtitle="נקרא מהפוסטים עצמם בפייסבוק, לא מחושב ולא משוער.">
      {!readAt ? (
        /*
         * The honest empty state. Collection happens on the machine, only when
         * it has nothing to publish, so "no numbers yet" is normal for a round
         * that is still running — and saying nothing here would read as a
         * round that achieved nothing.
         */
        <p className="text-sm text-mist-400">
          עוד לא נקראו נתונים מהפרסומים. התוכנה במחשב אוספת אותם כשאין לה מה לפרסם, ומרעננת כל כמה שעות — אם היא פועלת, המספרים יופיעו כאן בקרוב.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
            <Figure label="נצפה על ידי" value={seen.posts ? seen.total : null} posts={seen.posts} of={published.length} />
            <Figure label="לייקים" value={reactions.posts ? reactions.total : null} posts={reactions.posts} of={published.length} />
            <Figure label="תגובות" value={comments.posts ? comments.total : null} posts={comments.posts} of={published.length} />
            <Figure label="שיתופים" value={shares.posts ? shares.total : null} posts={shares.posts} of={published.length} />
          </dl>
          <p className="mt-3 text-xs text-mist-500">
            עודכן לאחרונה <Stamp iso={readAt} />
            {truncated && ' · הספירה מתייחסת לפרסומים שמוצגים במסך הזה בלבד.'}
          </p>
        </>
      )}
      {/*
        Said once, plainly, and not as an apology. Somebody who sells this will
        be asked "כמה אנשים ראו?" by a customer, and the true answer is worth
        more than a confident invented one.
      */}
      <p className="mt-2 text-xs text-mist-500">
        פייסבוק לא מפרסמת מספר חשיפה לפוסט בקבוצה, ולכן אין כאן מספר כזה. "נצפה על ידי" מופיע רק בקבוצות שבהן פייסבוק עצמה מציגה אותו.
      </p>
    </Card>
  );
}

/**
 * One figure, or an honest dash.
 *
 * A dash means "Facebook did not give us this", which is a real answer — and a
 * far better one than a 0 that says the post failed. The line underneath says
 * how many of the round's publications the number covers, because a total over
 * 3 posts out of 28 is a different claim from a total over all 28.
 */
function Figure({ label, value, posts, of }: { label: string; value: number | null; posts: number; of: number }) {
  return (
    <div className="rounded-xl bg-ink-800/60 px-3 py-2.5">
      <dt className="text-xs text-mist-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-extrabold tabular-nums text-ink-100">
        {value === null ? <span className="text-mist-500">—</span> : value.toLocaleString('he-IL')}
      </dd>
      <p className="mt-0.5 text-[11px] text-mist-500">
        {value === null
          ? 'פייסבוק לא מציגה'
          : posts >= of
            ? `מכל ${of} ה${agree(of, 'פרסום', 'פרסומים')}`
            : `מתוך ${posts} ${agree(posts, 'פרסום', 'פרסומים')}`}
      </p>
    </div>
  );
}
