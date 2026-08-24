'use client';

import { AdminShell } from '@/components/admin/AdminShell';
import { ProductForm } from '@/components/admin/ProductForm';

export default function NewProductPage() {
  return (
    <AdminShell title="מוצר חדש">
      <ProductForm product={null} />
    </AdminShell>
  );
}
