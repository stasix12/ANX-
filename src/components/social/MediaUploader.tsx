'use client';

import { useRef, useState } from 'react';
import { PlayIcon, PlusIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import { removeMedia, uploadMedia } from '@/lib/social/client';
import type { MediaItem } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * Images and one video for a post, stored in the public social-media bucket
 * (Meta fetches media by URL, so the files must be publicly readable).
 */
export function MediaUploader({
  media,
  onChange,
  /*
   * WHAT THIS PARTICULAR UPLOADER ACCEPTS, when it is not the usual answer.
   *
   * The footer below states the rule, and the rule is not the same everywhere:
   * a comment takes exactly one image. The comment sheet said so in its own
   * label and this footer contradicted it three centimetres lower — two
   * sentences, opposite claims, in the one place the limit matters.
   */
  hint,
}: {
  media: MediaItem[];
  onChange: (m: MediaItem[]) => void;
  hint?: string;
}) {
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
              /* The video tile has no thumbnail to show, so it names itself.
                 The clapper emoji stood in for the icon set everything else on
                 this screen draws from, and VoiceOver read it out as "clapper
                 board" before the file name. */
              <div className="grid h-full w-full place-items-center gap-1 px-1 text-center text-[11px] font-bold text-mist-300">
                <PlayIcon className="h-5 w-5" />
                <span dir="auto" className="w-full break-words">
                  {item.name}
                </span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => remove(item)}
              aria-label={item.kind === 'video' ? 'הסרת הסרטון' : 'הסרת התמונה'}
              className="absolute end-1 top-1 grid h-11 w-11 place-items-center rounded-full bg-ink-950/70 text-mist-100 ring-1 ring-ink-600 backdrop-blur-sm"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {/* This is the ONLY way to attach a photo to a post, and it is
            icon-only: with no aria-label VoiceOver announced it as "button". */}
        <button
          type="button"
          aria-label={busy ? 'מעלה קבצים…' : 'הוספת תמונה או סרטון'}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-ink-600 text-mist-500 hover:border-brand-300 hover:text-brand-400 disabled:opacity-50"
        >
          {busy ? <SpinnerIcon className="h-6 w-6 animate-spin" /> : <PlusIcon className="h-7 w-7" />}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <p className="mt-1.5 text-xs text-mist-500">{hint ?? 'תמונות (כמה שתרצו) או סרטון אחד.'} הקבצים נשמרים ב-Supabase Storage ומשם פייסבוק מושכת אותם.</p>
      {error && <p className="mt-1 text-sm text-error-400">{error}</p>}
    </div>
  );
}
