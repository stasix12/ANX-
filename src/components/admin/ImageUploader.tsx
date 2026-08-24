'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import { uploadProductImage } from '@/lib/adminProducts';

/**
 * Multi-upload, reorder and delete for one product's photos. The first image
 * in the list is always the card/gallery cover — "set as main" just moves an
 * image to the front rather than tracking a separate flag.
 */
export function ImageUploader({
  slug,
  images,
  onChange,
}: {
  slug: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await uploadProductImage(slug, file));
      }
      onChange([...images, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'העלאת תמונה נכשלה.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...images];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {images.map((src, index) => (
          <div key={src} className="relative aspect-square overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
            <Image src={src} alt="" fill sizes="120px" className="object-cover" />
            {index === 0 ? (
              <span className="absolute top-1 start-1 rounded-full bg-brand-500 px-2 py-0.5 text-[9px] font-bold text-on-brand">
                ראשית
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/55 p-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                aria-label="הזזה קדימה בתור"
                className="grid h-7 w-7 place-items-center rounded-lg text-white"
              >
                <ArrowUpIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                aria-label="הזזה אחורה בתור"
                className="grid h-7 w-7 place-items-center rounded-lg text-white"
              >
                <ArrowDownIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="מחיקת תמונה"
                className="grid h-7 w-7 place-items-center rounded-lg text-white"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-600 text-mist-500 transition-colors hover:border-brand-500 hover:text-brand-700">
          {uploading ? <SpinnerIcon className="h-6 w-6 animate-spin" /> : <PlusIcon className="h-6 w-6" />}
          <span className="text-[11px] font-semibold">הוספת תמונה</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => onFilesSelected(e.target.files)}
            disabled={uploading}
          />
        </label>
      </div>

      {error ? <p className="mt-2 text-sm font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
