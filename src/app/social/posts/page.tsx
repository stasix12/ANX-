'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@/components/icons';
import { SocialShell } from '@/components/social/SocialShell';
import { Badge, Button, Card, EmptyState, Notice, OverflowMenu, SegmentedControl, SkeletonList, inputClass, useConfirm, useToast } from '@/components/social/ui';
import { archivePost, duplicatePost, listCampaigns, listPosts } from '@/lib/social/client';
import { formatDateTimeHe } from '@/lib/social/time';
import type { Campaign, MediaItem, Post } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

type Filter = 'all' | 'ready' | 'draft';

/**
 * The post library. A post is the content; a campaign is the frame around it
 * and a queue row is one delivery of it. Duplicating a post is how a working
 * ad becomes next month's — the copy starts as a draft so nothing goes out
 * by accident.
 */
export default function PostsPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([listPosts(), listCampaigns()]);
      setPosts(p);
      setCampaigns(c);
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts ?? []).filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!q || p.title.toLowerCase().includes(q) || p.base_text.toLowerCase().includes(q) || (campaignName(p.campaign_id) ?? '').toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, filter, query, campaigns]);

  const counts = useMemo(
    () => ({
      all: posts?.length ?? 0,
      ready: posts?.filter((p) => p.status === 'ready').length ?? 0,
      draft: posts?.filter((p) => p.status === 'draft').length ?? 0,
    }),
    [posts],
  );

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SocialShell
      title="פוסטים"
      headerAction={
        <Link href="/social/posts/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-bold text-blue-700 shadow-sm">
          <PlusIcon className="h-4 w-4" strokeWidth={2.4} /> חדש
        </Link>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}

        {posts && posts.length > 0 && (
          <Card padded={false} className="p-3">
            <input type="search" className={inputClass} placeholder="חיפוש פוסט…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="חיפוש פוסט" />
            <SegmentedControl
              size="sm"
              label="סינון"
              className="mt-2.5"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'הכל', count: counts.all },
                { value: 'ready', label: 'מוכנים', count: counts.ready },
                { value: 'draft', label: 'טיוטות', count: counts.draft },
              ]}
            />
          </Card>
        )}

        {!posts && (
          <Card>
            <SkeletonList rows={4} />
          </Card>
        )}

        {posts && posts.length === 0 && (
          <EmptyState
            icon="📝"
            title="אין עדיין פוסטים"
            description="פוסט הוא הטקסט והתמונות שיוצאים לקבוצות ולדפים. אפשר ליצור גם כמה גרסאות שלו, כדי שאותו נוסח לא יחזור שוב ושוב."
            action={
              <Link href="/social/posts/new">
                <Button size="lg">צור פוסט ראשון</Button>
              </Link>
            }
          />
        )}

        {posts && posts.length > 0 && visible.length === 0 && (
          <EmptyState icon="🔎" title="אין פוסטים בסינון הזה" action={<Button variant="secondary" onClick={() => { setQuery(''); setFilter('all'); }}>נקה סינון</Button>} />
        )}

        {visible.length > 0 && (
          <Card padded={false}>
            <ul className="divide-y divide-ink-700">
              {visible.map((p) => {
                const media = p.media as MediaItem[];
                const cover = media.find((m) => m.kind === 'image');
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Link href={`/social/posts/${p.id}`} className="flex min-w-0 grow items-center gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-800">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-xl">📝</div>
                        )}
                      </div>
                      <div className="min-w-0 grow">
                        <p dir="auto" className="truncate font-bold text-mist-100">{p.title || p.base_text.slice(0, 60) || 'ללא כותרת'}</p>
                        <p className="truncate text-[11px] text-mist-500">
                          {campaignName(p.campaign_id) ?? 'ללא קמפיין'} · {p.language === 'ru' ? 'רוסית' : 'עברית'}
                          {media.length ? ` · ${media.length} מדיה` : ''} · {formatDateTimeHe(p.updated_at)}
                        </p>
                      </div>
                      <Badge tone={p.status === 'ready' ? 'good' : 'neutral'}>{p.status === 'ready' ? 'מוכן' : 'טיוטה'}</Badge>
                    </Link>
                    <OverflowMenu
                      label={p.title || 'פוסט'}
                      actions={[
                        { label: 'ערוך', icon: '✏️', onSelect: () => router.push(`/social/posts/${p.id}`) },
                        {
                          label: 'שכפל לפוסט חדש',
                          icon: '⧉',
                          disabled: busy === `dup-${p.id}`,
                          onSelect: async () => {
                            setBusy(`dup-${p.id}`);
                            try {
                              const copy = await duplicatePost(p.id);
                              toast('נוצר עותק כטיוטה.');
                              router.push(`/social/posts/${copy.id}`);
                            } catch (err) {
                              toast(friendlyMessage(err, 'השכפול נכשל.'), 'error');
                              setBusy(null);
                            }
                          },
                        },
                        {
                          label: 'העבר לארכיון',
                          icon: '🗄',
                          danger: true,
                          onSelect: async () => {
                            const ok = await confirm.ask({
                              title: 'להעביר לארכיון?',
                              body: 'תזמונים פעילים של הפוסט יבוטלו ופרסומים שטרם יצאו ידולגו. מה שכבר פורסם נשאר בהיסטוריה.',
                              confirmLabel: 'העבר לארכיון',
                              danger: true,
                            });
                            if (ok) await act(`arch-${p.id}`, () => archivePost(p.id), 'הפוסט הועבר לארכיון.');
                          },
                        },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
      {confirm.dialog}
    </SocialShell>
  );
}
