import type { Metadata } from 'next';
import { JoinWizard } from './JoinWizard';

export const metadata: Metadata = { title: 'הרשמת בעל מקצוע' };

export default function JoinPage() {
  return <JoinWizard />;
}
