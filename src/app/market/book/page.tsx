import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BookingWizard } from './BookingWizard';

export const metadata: Metadata = { title: 'הזמנת שירות' };

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookingWizard />
    </Suspense>
  );
}
