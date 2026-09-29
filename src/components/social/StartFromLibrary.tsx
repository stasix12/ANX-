'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listRecentPosts } from '@/lib/social/client';
import type { Post } from '@/lib/social/types';
import { ClipboardListIcon } from '@/components/icons';
import { PostCover } from './PostCover';
import { Card, Skeleton } from './ui';

/**
 * "התחילו מפוסט שכבר יש לכם" — the library, inside the campaign flow.
 *
 * WHY IT EXISTS. "+ קמפיין חדש" opens this editor, and the editor opens
 * empty: an internal name, an empty text box, an empty link, an empty media
 * area. The owner has a library full of posts they have published dozens of
 * times and was being asked to type it all again — "בתוך הקמפיינים אני רוצה
 * שיהיה את ספריית התוכן שלי שאני לוחץ וזה ממלא כבר הכל".
 *
 * WHAT IT DOES NOT DO is open the old post. Tapping one COPIES its content
 * into the form in front of them — text, pictures, link, button, language,
 * variants — and the post they started from is not touched. That distinction
 * is the whole safety of it: a campaign editor that quietly edited last
 * month's post would change what is already scheduled somewhere else.
 *
 * IT REMOVES ITSELF the moment there is anything to lose. A form with a title
 * or text in it is work in progress, and a row of thumbnails whose job is to
 * overwrite the form has no business sitting above it.
 */
export function StartFromLibrary({ onPick, hidden }: { onPick: (post: Post) => void; hidden: boolean }) {
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    listRecentPosts()
      .then((p) => {
        if (alive) setPosts(p);
      })
      /* A picker that cannot load is a shortcut that is missing, not an error
         worth a red banner over an editor that works perfectly without it. */
      .catch(() => {
        if (alive) setPosts([]);
      });
    return () => {
      alive = false;
    };
  }, [hidden]);

  if (hidden) return null;
  /* Nothing to offer: a brand-new account has an empty library, and an empty
     card telling them so is furniture above the form they came to fill. */
  if (posts?.length === 0) return null;

  return (
    <Card
      title="התחילו מפוסט שכבר יש לכם"
      subtitle="לחיצה ממלאת את הטופס — הטקסט, התמונות, הקישור והכפתור. הפוסט המקורי לא משתנה."
      action={
        <Link href="/social/library" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand-400">
          כל הספרייה
        </Link>
      }
    >
      {!posts ? (
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-20 rounded-xl" />
          ))}
        </div>
      ) : (
        /*
         * A horizontal strip, not a grid: this is a shortcut above a form, and
         * a grid of twelve covers would push the thing they came to do off the
         * screen. snap-x so a thumb lands on a whole card rather than between
         * two. -mx-1/px-1 lets the first and last card's focus ring breathe
         * without the strip inheriting the card's padding as dead space.
         */
        <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [&>*]:min-w-0">
          {posts.map((p) => (
            <li key={p.id} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onPick(p)}
                className="block w-20 rounded-xl border border-ink-700 bg-ink-850 p-1.5 text-start transition-colors hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                {p.media?.length ? (
                  <PostCover media={p.media} className="h-16 w-full" />
                ) : (
                  /* A post with no picture is normal — plenty are text and a
                     WhatsApp button — so it gets a mark rather than a gap that
                     reads as a cover that failed to load. */
                  <span className="grid h-16 w-full place-items-center rounded-lg bg-ink-800 text-ink-500">
                    <ClipboardListIcon aria-hidden className="h-4 w-4" />
                  </span>
                )}
                {/* dir="auto": a post named in Russian or English inside an RTL
                    card clips at the wrong end without it. */}
                <span dir="auto" className="mt-1 block truncate text-[11px] font-bold leading-4 text-mist-100">
                  {p.title || 'ללא שם'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
