'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CopyIcon } from '@/components/icons';
import { PostPreview } from '@/components/social/PostPreview';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Field, Loading, Notice, inputClass } from '@/components/social/ui';
import { cancelQueueItem, getPost, getQueueItem, markManualPublished, type QueueRow } from '@/lib/social/client';
import type { MediaItem, Post } from '@/lib/social/types';

/**
 * The legal fallback for Facebook Groups: everything the owner needs to
 * publish by hand in under a minute — text (one tap to copy), the media
 * files, the group link — then a button to record the result.
 */
export default function ManualKitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<QueueRow | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [permalink, setPermalink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getQueueItem(id)
      .then(async (q) => {
        setItem(q);
        if (q) setPost(await getPost(q.post_id));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'טעינה נכשלה.'));
  }, [id]);

  async function copyText() {
    if (!item) return;
    await navigator.clipboard.writeText(item.rendered_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const media = (post?.media ?? []) as MediaItem[];

  return (
    <SocialShell title="ערכת פרסום ידני">
      {error && <Notice tone="error">{error}</Notice>}
      {!item && !error && <Loading />}
      {item && (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Notice tone="info">
              Meta אינה מאפשרת פרסום אוטומטי לקבוצות. הכול מוכן — <strong>1)</strong> העתיקו את הטקסט, <strong>2)</strong> הורידו את המדיה, <strong>3)</strong> פתחו את הקבוצה ופרסמו, <strong>4)</strong> סמנו כאן "פורסם".
            </Notice>
            <Card title={`יעד: ${item.target?.name ?? ''}`} action={item.target?.url ? <a href={item.target.url} target="_blank" rel="noreferrer" className="rounded-xl bg-brand-500 px-3.5 py-2 text-sm font-bold text-on-brand">פתח את הקבוצה ↗</a> : null}>
              <div className="relative">
                <textarea readOnly dir="auto" className={`${inputClass} min-h-48`} value={item.rendered_text} />
                <Button variant="secondary" onClick={copyText} className="absolute bottom-3 start-3">
                  <CopyIcon className="h-4 w-4" /> {copied ? 'הועתק!' : 'העתק טקסט'}
                </Button>
              </div>
              {media.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-bold text-mist-300">מדיה להורדה</p>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {media.map((m) => (
                      <li key={m.url}>
                        <a href={m.url} download target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
                          {m.kind === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                          ) : (
                            <div className="grid aspect-square place-items-center text-xs font-bold text-mist-300">🎬 הורד סרטון</div>
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {post?.link_url && (
                <p className="mt-3 text-sm">
                  <span className="text-mist-500">קישור לצירוף: </span>
                  <a href={post.link_url} dir="ltr" className="text-brand-400" target="_blank" rel="noreferrer">
                    {post.link_url}
                  </a>
                </p>
              )}
            </Card>
            {item.status === 'manual_pending' ? (
              <Card title="סיום">
                <Field label="קישור לפוסט שפורסם (רשות)">
                  <input className={inputClass} dir="ltr" value={permalink} onChange={(e) => setPermalink(e.target.value)} placeholder="https://www.facebook.com/groups/…/posts/…" />
                </Field>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => markManualPublished(item.id, permalink).then(() => router.push('/social'))}>סמן כפורסם</Button>
                  <Button variant="secondary" onClick={() => cancelQueueItem(item.id).then(() => router.push('/social'))}>
                    דלג על הפרסום הזה
                  </Button>
                </div>
              </Card>
            ) : (
              <Notice tone="success">הפריט כבר טופל (סטטוס: {item.status}).</Notice>
            )}
          </div>
          <aside>
            <PostPreview pageName={item.target?.name ?? 'קבוצה'} text={item.rendered_text} media={media} link={post?.link_url ?? ''} cta="" />
          </aside>
        </div>
      )}
    </SocialShell>
  );
}
