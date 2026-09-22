import Link from 'next/link';
import type { ReactNode } from 'react';
import { legalPageGraph } from '@/lib/schema';
import { JsonLd } from '@/components/ui/JsonLd';

export function LegalPage({
  title,
  path,
  updated,
  children,
}: {
  title: string;
  path: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="section">
      <JsonLd data={legalPageGraph(title, path)} />
      <div className="container-narrow">
        <nav aria-label="פירורי לחם" className="text-sm text-subtle">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-fg">
                דף הבית
              </Link>
            </li>
            <li aria-hidden>‹</li>
            <li aria-current="page" className="text-muted">
              {title}
            </li>
          </ol>
        </nav>
        <h1 className="h2 mt-6 text-fg">{title}</h1>
        <div className="legal mt-8 space-y-6 text-base leading-relaxed text-muted [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg [&_ul]:list-disc [&_ul]:ps-5 [&_li]:mt-1.5">
          {children}
        </div>
        <p className="mt-10 text-sm text-subtle">
          עדכון אחרון:{' '}
          <time dateTime={updated}>
            {new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(new Date(updated))}
          </time>
        </p>
      </div>
    </article>
  );
}
