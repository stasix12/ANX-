import type { Metadata } from 'next';
import { FavoritesView } from '@/components/shop/views/FavoritesView';

export const metadata: Metadata = { title: 'מועדפים', robots: { index: false } };

export default function FavoritesPage() {
  return <FavoritesView />;
}
