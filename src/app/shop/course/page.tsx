import type { Metadata } from 'next';
import { CourseView } from '@/components/shop/views/CourseView';

export const metadata: Metadata = { title: 'כניסה לקורס', robots: { index: false } };

export default function CoursePage() {
  return <CourseView />;
}
