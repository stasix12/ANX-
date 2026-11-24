import type { Metadata } from 'next';
import { HomeView } from '@/components/shop/views/HomeView';

/**
 * The ANX3D store opens straight at the domain root (anx3d.co.il); /shop keeps
 * serving the same home so older links still work.
 */
export const metadata: Metadata = {
  title: { absolute: 'ANX3D — הדור הבא של ציוד הניקוי המקצועי' },
  description:
    'ANX3D: ידיות לניקוי ספות, טולים לניקוי שטיחים, מתאמים, מחברים ואביזרי שאיבה לאנשי מקצוע — מיוצרים בהדפסת תלת־ממד.',
  alternates: { canonical: '/' },
};

export default function Home() {
  return (
    <div className="shop-theme min-h-dvh overflow-x-clip">
      <HomeView />
    </div>
  );
}
