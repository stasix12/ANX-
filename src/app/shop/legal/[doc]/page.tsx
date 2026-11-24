import type { Metadata } from 'next';
import { LegalView } from '@/components/shop/views/LegalView';
import { LEGAL_DOCS, LEGAL_SLUGS } from '@/lib/shop/legal';

interface PageProps {
  params: Promise<{ doc: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { doc } = await params;
  const d = LEGAL_DOCS.find((x) => x.slug === doc);
  return { title: d?.title ?? 'מידע', alternates: { canonical: `/shop/legal/${doc}` } };
}

export default async function LegalPage({ params }: PageProps) {
  const { doc } = await params;
  return <LegalView slug={doc} />;
}
