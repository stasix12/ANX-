'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ProductForm } from '@/components/admin/ProductForm';
import { SpinnerIcon } from '@/components/icons';
import { fetchProductByIdAdmin, type Product } from '@/lib/products';

function EditProductInner() {
  const id = useSearchParams().get('id');
  const [product, setProduct] = useState<Product | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setProduct(null);
      return;
    }
    fetchProductByIdAdmin(id).then(setProduct);
  }, [id]);

  if (product === undefined) {
    return (
      <div className="grid place-items-center py-16">
        <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
      </div>
    );
  }

  if (product === null) {
    return <p className="text-center text-sm text-mist-500">המוצר לא נמצא.</p>;
  }

  return <ProductForm product={product} />;
}

export default function EditProductPage() {
  return (
    <AdminShell title="עריכת מוצר">
      <Suspense
        fallback={
          <div className="grid place-items-center py-16">
            <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
          </div>
        }
      >
        <EditProductInner />
      </Suspense>
    </AdminShell>
  );
}
