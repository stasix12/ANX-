import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CatalogView, CatalogWithParams } from '@/components/shop/views/CatalogView';
import { SEED_CATEGORIES } from '@/lib/shop/seed';
import { STATIC_CATEGORY_SLUGS } from '@/lib/shop/static';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return [...STATIC_CATEGORY_SLUGS].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const cat = SEED_CATEGORIES.find((c) => c.slug === slug);
  const name = cat?.name ?? 'כל המוצרים';
  return {
    title: name,
    description: `${name} מודפסים בתלת ממד — ANX3D. עיצובים ייחודיים, איכות הדפסה גבוהה ומגוון צבעים.`,
    alternates: { canonical: `/shop/c/${slug}` },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  return (
    <Suspense fallback={<CatalogView slug={slug} />}>
      <CatalogWithParams slug={slug} />
    </Suspense>
  );
}
