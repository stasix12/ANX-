import type { Metadata } from 'next';
import { ProLanding } from './ProLanding';

export const metadata: Metadata = {
  title: 'הצטרפו כבעלי מקצוע — קבלו עבודות ניקוי באזור שלכם',
  description:
    'פלטפורמת עבודות לניקוי ספות, מזרנים ומזגנים: התראות בזמן אמת על עבודות באזורכם, תשלום מסודר, בלי לשלם על פרסום.',
};

export default function ProLandingPage() {
  return <ProLanding />;
}
