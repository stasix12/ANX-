import Image from 'next/image';
import { asset } from '@/lib/site';

/**
 * The compatibility strip at the top of the home page: the machines these
 * parts are built for.
 *
 * The tiles are numbered drawings, not photographs. The machines are made by
 * another company and their catalogue images are theirs — these hold the
 * layout until the shop supplies its own photographs, or a media pack the
 * manufacturer has actually licensed. Replace public/machines/<n>.svg (any
 * image extension works, the paths below just have to match).
 *
 * The wording is a compatibility claim — what these parts fit — and not a
 * claim to represent the manufacturer, which is a different thing entirely
 * and not one this shop can make.
 */
const machines = [
  { file: '1.svg', name: 'Sabrina', note: 'ידיות, צינורות ומתאמים' },
  { file: '2.svg', name: 'מכונת אקסטרקציה', note: 'להשלמה — שם הדגם' },
  { file: '3.svg', name: 'מכונת אקסטרקציה', note: 'להשלמה — שם הדגם' },
  { file: '4.svg', name: 'מכונת אקסטרקציה', note: 'להשלמה — שם הדגם' },
];

export function MachineStrip() {
  return (
    <section aria-labelledby="machines-title" className="border-b border-ink-700 py-7 sm:py-9">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 id="machines-title" className="text-xl font-extrabold sm:text-2xl">
          הציוד שאנחנו משדרגים
        </h2>
        <p className="mt-1.5 text-sm text-mist-300">
          האביזרים שלנו מיוצרים עבור מכונות Santoemma Sabrina לניקוי ספות וריפודים.
        </p>
      </div>

      {/*
        Scrolls rather than wraps, and the gutters are margins on the end items
        rather than padding on the container, with scroll padding to match:
        scroll-snap-align lands on an item's border box and ignores its margin,
        so without that the strip snapped straight past the gutter and left the
        first tile flush against the edge of the screen while every other row on
        the page is inset.
      */}
      <ul className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-ps-4 pb-1 sm:gap-4 sm:scroll-ps-6">
        {machines.map(({ file, name, note }) => (
          <li
            key={file}
            className="w-[240px] shrink-0 snap-start first:ms-4 last:me-4 sm:w-[280px] sm:first:ms-6 sm:last:me-6"
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-ink-700 bg-ink-850">
              <Image
                src={asset(`/machines/${file}`)}
                alt={`${name} — מכונה שהאביזרים שלנו מתאימים לה`}
                fill
                sizes="280px"
                className="object-cover"
              />
            </div>
            <p className="mt-2 text-sm font-bold">{name}</p>
            <p className="text-xs text-mist-500">{note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
