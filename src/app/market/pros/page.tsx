import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProsBrowser } from './ProsBrowser';

export const metadata: Metadata = { title: 'בעלי מקצוע באזור שלך' };

export default function ProsPage() {
  return (
    <Suspense fallback={null}>
      <ProsBrowser />
    </Suspense>
  );
}
