import type { Metadata } from 'next';
import { CategoriesView } from '@/components/shop/views/CategoriesView';

export const metadata: Metadata = {
  title: 'קטגוריות',
  description: 'ידיות לניקוי ספות, טולים לניקוי שטיחים, מתאמים ומחברים, אביזרי שאיבה, חלקי חילוף ואביזרים משלימים — ANX3D.',
  alternates: { canonical: '/shop/categories' },
};

export default function CategoriesPage() {
  return <CategoriesView />;
}
