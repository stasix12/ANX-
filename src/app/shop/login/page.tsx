import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginView, LoginWithParams } from '@/components/shop/views/AuthView';

export const metadata: Metadata = { title: 'התחברות', robots: { index: false } };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginView />}>
      <LoginWithParams />
    </Suspense>
  );
}
