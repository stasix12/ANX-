import type { Metadata } from 'next';
import { CourseAdminView } from '@/components/shop/views/CourseAdminView';

export const metadata: Metadata = { title: 'ניהול קורסים', robots: { index: false, follow: false } };

export default function CourseAdminPage() {
  return <CourseAdminView />;
}
