'use client';

import { CTA_OPTIONS, type CtaType, type MediaItem } from '@/lib/social/types';

/**
 * A faithful-enough rendition of how the post will look in the Facebook
 * feed: page header, text with Facebook's "see more" fold, the media grid
 * (1 / 2 / 3+ layouts), a link card and the CTA button. Purely visual.
 */
export function PostPreview({
  pageName,
  text,
  media,
  link,
  cta,
}: {
  pageName: string;
  text: string;
  media: MediaItem[];
  link: string;
  cta: CtaType;
}) {
  const images = media.filter((m) => m.kind === 'image');
  const video = media.find((m) => m.kind === 'video');
  const ctaLabel = CTA_OPTIONS.find((c) => c.value === cta)?.label;
  const host = safeHost(link);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm" dir="auto">
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-sky-400 text-sm font-extrabold text-white">
          {pageName.slice(0, 1) || 'פ'}
        </div>
        <div>
          <p className="text-sm font-bold">{pageName || 'שם הדף'}</p>
          <p className="text-xs text-slate-500">עכשיו · 🌐</p>
        </div>
      </div>

      <p className="whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed">
        {text.trim() ? (
          text.length > 400 ? (
            <>
              {text.slice(0, 400)}… <span className="font-semibold text-slate-500">עוד</span>
            </>
          ) : (
            text
          )
        ) : (
          <span className="text-slate-400">הטקסט של הפוסט יופיע כאן</span>
        )}
      </p>

      {video && (
        <div className="relative aspect-video bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={video.url} controls className="h-full w-full" />
        </div>
      )}

      {!video && images.length > 0 && (
        <div className={`grid gap-0.5 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.slice(0, 4).map((img, i) => (
            <div key={img.url} className={`relative bg-slate-100 ${images.length === 3 && i === 0 ? 'col-span-2 aspect-[2/1]' : 'aspect-square'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              {i === 3 && images.length > 4 && (
                <span className="absolute inset-0 grid place-items-center bg-black/50 text-2xl font-bold text-white">+{images.length - 4}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!video && images.length === 0 && link && (
        <div className="border-y border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{host}</p>
          <p className="truncate text-sm font-bold">{link}</p>
        </div>
      )}

      {ctaLabel && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="truncate text-xs text-slate-500">{host || 'הפתרון המבריק'}</p>
          <span className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800">{ctaLabel}</span>
        </div>
      )}

      <div className="flex justify-around border-t border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">
        <span>👍 אהבתי</span>
        <span>💬 תגובה</span>
        <span>↗ שיתוף</span>
      </div>
    </div>
  );
}

function safeHost(link: string): string {
  try {
    return link ? new URL(link).host.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}
