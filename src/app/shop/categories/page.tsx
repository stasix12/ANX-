import type { Metadata } from 'next';
import { CategoriesView } from '@/components/shop/views/CategoriesView';

export const metadata: Metadata = {
  title: 'קטגוריות',
  description: 'דמויות, גיימינג, בית ודקור, כלי עבודה, מעמדים, חיות ומפלצות, חלקים תפקודיים וקבצי STL — ANX3D.',
  alternates: { canonical: '/shop/categories' },
};

export default function CategoriesPage() {
  return <CategoriesView />;
}
