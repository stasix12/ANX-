import type { Metadata } from 'next';
import { AccountSectionView } from '@/components/shop/views/AccountView';
import { ACCOUNT_SECTIONS, type AccountSection } from '@/lib/shop/account';

interface PageProps {
  params: Promise<{ section: string }>;
}

export const dynamicParams = false;
export const metadata: Metadata = { title: 'אזור אישי', robots: { index: false } };

export function generateStaticParams() {
  return ACCOUNT_SECTIONS.map((section) => ({ section }));
}

export default async function AccountSectionPage({ params }: PageProps) {
  const { section } = await params;
  return <AccountSectionView section={section as AccountSection} />;
}
