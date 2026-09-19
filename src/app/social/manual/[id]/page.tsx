'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CopyIcon } from '@/components/icons';
import { PostPreview } from '@/components/social/PostPreview';
import { SocialShell } from '@/components/social/SocialShell';
import { Badge, Button, Card, EmptyState, Field, Loading, Notice, ProgressBar, inputClass, useToast } from '@/components/social/ui';
import { cancelQueueItem, getPost, getQueueItem, manualQueue, markManualPublished, type QueueRow } from '@/lib/social/client';
import type { MediaItem, Post } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * Assisted publishing: the path for a target with no official publishing API
 * and no browser automation behind it. Nothing here bypasses a Facebook
 * limit — the owner posts it themselves; the screen just removes every step
 * that is not the posting itself.
 *
 * It walks the whole manual queue in place ("group 7 of 32") so thirty groups
 * are thirty taps instead of thirty trips back to the dashboard.
 */
export default function ManualKitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<QueueRow | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [permalink, setPermalink] = useState('');
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [busy, setBusy] = useState(false);
  /* Distinct from `item`: a finished fetch that found nothing is not loading. */
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setCopied(false);
    setOpened(false);
    setPermalink('');
    setLoaded(false);
    Promise.all([getQueueItem(id), manualQueue()])
      .then(async ([q, all]) => {
        setItem(q);
        setQueue(all);
        if (q) setPost(await getPost(q.post_id));
      })
      .catch((err) => setError(friendlyMessage(err, 'טעינה נכשלה.')))
      .finally(() => setLoaded(true));
  }, [id]);

  const position = queue.findIndex((q) => q.id === id);
  const remaining = queue.filter((q) => q.id !== id);
  const stepNumber = position >= 0 ? position + 1 : 1;

  const goNext = () => {
    if (remaining.length) router.replace(`/social/manual/${remaining[0].id}`);
    else router.push('/social');
  };

  async function finish(action: 'published' | 'skip') {
    if (!item) return;
    setBusy(true);
    try {
      if (action === 'published') {
        await markManualPublished(item.id, permalink);
        toast(remaining.length ? `נשמר. ממשיכים לקבוצה הבאה (${remaining.length} נותרו).` : 'נשמר. סיימתם את כל התור!');
      } else {
        await cancelQueueItem(item.id);
        toast('דולג.', 'info');
      }
      goNext();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.rendered_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused (older iOS, an insecure origin). The
      // text is on screen and selectable, so say that rather than failing mute.
      toast('הדפדפן חסם העתקה — סמנו את הטקסט והעתיקו ידנית.', 'error');
    }
  }

  const media = (post?.media ?? []) as MediaItem[];

  return (
    <SocialShell
      title="פרסום בעזרת המערכת"
      headerAction={
        queue.length > 1 ? (
          <span className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold text-white">
            {stepNumber} מתוך {queue.length}
          </span>
        ) : undefined
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!loaded && !error && <Loading />}
      {/* A finished fetch that found nothing used to leave the spinner turning
          forever. The row is gone when it was already published, cancelled, or
          the link is stale — so say that, and offer the way on. */}
      {loaded && !item && !error && (
        <EmptyState
          icon="✅"
          title="הפריט הזה כבר לא ממתין"
          description="הוא כנראה כבר פורסם, דולג או הוסר. אפשר להמשיך לפריט הבא בתור."
          action={
            <Button size="lg" onClick={goNext}>
              {remaining.length ? 'לפריט הבא' : 'חזרה ללוח הבקרה'}
            </Button>
          }
        />
      )}
      {item && (
        <div className="space-y-4">
          {queue.length > 1 && (
            <ProgressBar
              total={queue.length}
              segments={[{ value: stepNumber - 1, className: 'bg-emerald-500' }]}
              ariaLabel={`קבוצה ${stepNumber} מתוך ${queue.length}`}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
            <div className="min-w-0 space-y-4">
              <Card
                title={item.target?.name ?? 'יעד'}
                subtitle="שלושה שלבים: העתיקו · פתחו · פרסמו"
                action={<Badge tone="brand">פרסום ידני</Badge>}
              >
                {/* Step 1 */}
                <Step n={1} title="העתיקו את הטקסט" done={copied}>
                  <textarea readOnly dir="auto" aria-label="הטקסט לפרסום" className={`${inputClass} min-h-40`} value={item.rendered_text} onFocus={(e) => e.currentTarget.select()} />
                  <Button size="lg" className="mt-2 w-full" variant={copied ? 'secondary' : 'primary'} onClick={copyText}>
                    <CopyIcon className="h-4 w-4" /> {copied ? '✓ הועתק' : 'העתק טקסט'}
                  </Button>
                </Step>

                {/* Step 2 */}
                {media.length > 0 && (
                  <Step n={2} title="הורידו את המדיה">
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
                      {media.map((m) => (
                        <li key={m.url}>
                          <a href={m.url} download target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
                            {m.kind === 'image' ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                            ) : (
                              <div className="grid aspect-square place-items-center text-xs font-bold text-mist-300">🎬 סרטון</div>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-mist-500">באייפון: לחיצה ארוכה על התמונה ← "שמור תמונה".</p>
                  </Step>
                )}

                {/* Step 3 */}
                <Step n={media.length > 0 ? 3 : 2} title="פתחו את הקבוצה ופרסמו" done={opened}>
                  {item.target?.url ? (
                    <a
                      href={item.target.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpened(true)}
                      className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-base font-bold text-on-brand"
                    >
                      פתח את הקבוצה בפייסבוק ↗
                    </a>
                  ) : (
                    <p className="text-sm text-mist-500">אין קישור ליעד הזה.</p>
                  )}
                  {post?.link_url && (
                    <p className="mt-2 text-sm">
                      <span className="text-mist-500">קישור לצירוף: </span>
                      <a href={post.link_url} dir="ltr" className="text-brand-400" target="_blank" rel="noreferrer">
                        {post.link_url}
                      </a>
                    </p>
                  )}
                </Step>
              </Card>

              {item.status === 'manual_pending' ? (
                <Card title="סיימתם?">
                  <Field label="קישור לפוסט שפורסם (רשות)" hint="נשמר בהיסטוריה כדי שתוכלו לחזור אליו">
                    <input className={inputClass} dir="ltr" inputMode="url" value={permalink} onChange={(e) => setPermalink(e.target.value)} placeholder="https://www.facebook.com/groups/…/posts/…" />
                  </Field>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
                    <Button size="lg" busy={busy} onClick={() => finish('published')}>
                      ✅ פורסם{remaining.length > 0 ? ' — לבא' : ''}
                    </Button>
                    <Button size="lg" variant="secondary" busy={busy} onClick={() => finish('skip')}>
                      דלג על הקבוצה
                    </Button>
                  </div>
                  {remaining.length > 0 && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                      <span className="text-mist-500">הבאה בתור: {remaining[0].target?.name ?? '—'}</span>
                      <button type="button" onClick={goNext} className="min-h-9 font-bold text-brand-400">
                        עבור לבא בלי לשנות →
                      </button>
                    </div>
                  )}
                </Card>
              ) : (
                <Notice tone="success">הפריט כבר טופל. אפשר להמשיך לבא בתור.</Notice>
              )}
            </div>

            <aside className="min-w-0 space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-mist-500">איך זה ייראה</p>
              <PostPreview pageName={item.target?.name ?? 'קבוצה'} text={item.rendered_text} media={media} link={post?.link_url ?? ''} cta="" />
            </aside>
          </div>
        </div>
      )}
    </SocialShell>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-700 pt-3 first:border-0 first:pt-0 [&+&]:mt-3">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-mist-100">
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${done ? 'bg-emerald-500 text-white' : 'bg-brand-500/15 text-brand-400'}`}
        >
          {done ? '✓' : n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
