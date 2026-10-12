'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ProductView } from '@/components/shop/views/ProductView';

/** Client-side product page for products added in the admin after the last build. */
function Item() {
  const slug = useSearchParams().get('s');
  return <ProductView slug={slug} />;
}

export default function ItemPage() {
  return (
    <Suspense fallback={<ProductView slug={null} />}>
      <Item />
    </Suspense>
  );
}
