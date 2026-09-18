'use client';

import { useRef, useState } from 'react';
import { PlusIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import { removeMedia, uploadMedia } from '@/lib/social/client';
import type { MediaItem } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * Images and one video for a post, stored in the public social-media bucket
 * (Meta fetches media by URL, so the files must be publicly readable).
 */
export function MediaUploader({ media, onChange }: { media: MediaItem[]; onChange: (m: MediaItem[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...media];
      for (const file of Array.from(files)) {
        if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name}: קובץ גדול מ-100MB.`);
        const item = await uploadMedia(file);
        if (item.kind === 'video' && next.some((m) => m.kind === 'video')) throw new Error('פייסבוק מאפשר סרטון אחד לפוסט.');
        next.push(item);
      }
      onChange(next);
    } catch (err) {
      setError(friendlyMessage(err, 'ההעלאה נכשלה.'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(item: MediaItem) {
    onChange(media.filter((m) => m.url !== item.url));
    await removeMedia(item).catch(() => undefined);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 [&>*]:min-w-0">
        {media.map((item) => (
          <div key={item.url} className="relative aspect-square overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
            {item.kind === 'video' ? (
              <div className="grid h-full w-full place-items-center text-xs font-bold text-mist-300">🎬 {item.name}</div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => remove(item)}
              aria-label="הסר"
              className="absolute end-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-ink-600 text-mist-500 hover:border-brand-500 hover:text-brand-400 disabled:opacity-60"
        >
          {busy ? <SpinnerIcon className="h-6 w-6 animate-spin" /> : <PlusIcon className="h-7 w-7" />}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <p className="mt-1.5 text-xs text-mist-500">תמונות (כמה שתרצו) או סרטון אחד. הקבצים נשמרים ב-Supabase Storage ומשם פייסבוק מושכת אותם.</p>
      {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
