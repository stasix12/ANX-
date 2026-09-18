'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@/components/icons';
import { SocialShell } from '@/components/social/SocialShell';
import { Card, Empty, Loading, Notice } from '@/components/social/ui';
import { duplicatePost, listCampaigns, listPosts } from '@/lib/social/client';
import { formatDateTimeHe } from '@/lib/social/time';
import type { Campaign, MediaItem, Post } from '@/lib/social/types';

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.all([listPosts(), listCampaigns()])
      .then(([p, c]) => {
        setPosts(p);
        setCampaigns(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'טעינה נכשלה.'));
  }, []);

  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name;

  return (
    <SocialShell
      title="פוסטים"
      headerAction={
        <Link href="/social/posts/new" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-bold text-blue-700 shadow-sm">
          <PlusIcon className="h-4 w-4" strokeWidth={2.4} /> פוסט חדש
        </Link>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!posts && !error && <Loading />}
      {posts && (
        <Card>
          {posts.length === 0 ? (
            <Empty>אין פוסטים עדיין. התחילו מפוסט חדש.</Empty>
          ) : (
            <ul className="divide-y divide-ink-700">
              {posts.map((p) => {
                const media = p.media as MediaItem[];
                const cover = media.find((m) => m.kind === 'image');
                return (
                  <li key={p.id}>
                    <Link href={`/social/posts/${p.id}`} className="flex items-center gap-3 py-3 hover:bg-ink-900/60">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {cover ? <img src={cover.url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xl">📝</div>}
                      </div>
                      <div className="min-w-0 grow">
                        <p className="truncate font-bold text-mist-100">{p.title || p.base_text.slice(0, 60) || 'ללא כותרת'}</p>
                        <p className="truncate text-xs text-mist-500">
                          {campaignName(p.campaign_id) ?? 'ללא קמפיין'} · {p.language === 'ru' ? 'רוסית' : 'עברית'} · {media.length} מדיה · עודכן {formatDateTimeHe(p.updated_at)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${p.status === 'ready' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-slate-500/15 text-slate-600'}`}>
                        {p.status === 'ready' ? 'מוכן' : 'טיוטה'}
                      </span>
                    </Link>
                    <div className="flex justify-end pb-2">
                      <button
                        type="button"
                        disabled={copying === p.id}
                        className="text-xs font-bold text-brand-400 disabled:opacity-50"
                        onClick={async () => {
                          setCopying(p.id);
                          try {
                            const copy = await duplicatePost(p.id);
                            router.push(`/social/posts/${copy.id}`);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'השכפול נכשל.');
                            setCopying(null);
                          }
                        }}
                      >
                        {copying === p.id ? 'משכפל…' : '⧉ שכפל פוסט'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </SocialShell>
  );
}
