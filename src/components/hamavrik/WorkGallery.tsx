import Image from 'next/image';
import { workGallery } from '@/lib/hamavrik/config';

/**
 * Real job photos (REAL PHOTOS: workGallery in config.ts). Renders nothing
 * while the list is empty — the section only exists once there is something
 * real to show.
 */
export function WorkGallery() {
  if (!workGallery.length) return null;
  return (
    <section id="gallery" className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="mb-6 text-center text-[1.75rem] font-black sm:text-4xl">מהשטח</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {workGallery.map((photo) => (
            <li key={photo.src} className="surface overflow-hidden rounded-2xl">
              <figure>
                <Image src={photo.src} alt={photo.alt} width={800} height={600} sizes="(max-width: 640px) 50vw, 25vw" className="aspect-4/3 w-full object-cover" />
                {photo.caption ? <figcaption className="px-3 py-2 text-xs font-bold text-mist-300">{photo.caption}</figcaption> : null}
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
