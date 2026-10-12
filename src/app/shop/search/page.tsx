import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchView, SearchWithParams } from '@/components/shop/views/SearchView';

export const metadata: Metadata = { title: 'חיפוש', robots: { index: false } };

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchView />}>
      <SearchWithParams />
    </Suspense>
  );
}
