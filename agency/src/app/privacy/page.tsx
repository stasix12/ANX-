import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/config/site';
import { analyticsIds } from '@/lib/analytics';
import { formatPhoneDisplay } from '@/lib/phone';
import { LegalPage } from '@/components/layout/LegalPage';

export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description: `מדיניות הפרטיות של אתר ${site.name}: איזה מידע נאסף בטופס ובכלי המדידה, למה הוא משמש ומה הזכויות שלכם.`,
  alternates: { canonical: '/privacy' },
};

/**
 * Basic wording, not legal advice — TODO (client): have it reviewed before
 * launch. The tools list reflects what is actually configured in .env.
 */
export default function PrivacyPage() {
  const tools = [
    analyticsIds.gtm || analyticsIds.ga4 ? 'Google Analytics' : '',
    analyticsIds.gadsId ? 'Google Ads' : '',
    analyticsIds.metaPixel ? 'Meta Pixel' : '',
  ].filter(Boolean);

  return (
    <LegalPage title="מדיניות פרטיות" path="/privacy" updated={site.legalPagesUpdated}>
      <p>
        <span dir="ltr">{site.name}</span> מכבד את פרטיותכם. מסמך זה מסביר בקצרה איזה מידע נאסף באתר, למה, ומה הזכויות
        שלכם.
      </p>
      <h2>איזה מידע נאסף</h2>
      <p>
        כשאתם ממלאים טופס באתר, אנחנו מקבלים את הפרטים שמסרתם: שם, טלפון, שם העסק והאפשרות שבחרתם. כשאתם לוחצים על כפתור
        WhatsApp, השיחה מתנהלת באפליקציית WhatsApp לפי תנאי השימוש שלה.
      </p>
      <h2>למה משתמשים במידע</h2>
      <p>
        כדי לחזור אליכם בעניין הפנייה ולהכין לכם הצעה. הפרטים לא נמכרים ולא מועברים לצד שלישי, למעט ספקי שירות שמפעילים
        את הטופס או את האתר עבורנו.
      </p>
      <h2>כלי מדידה</h2>
      {tools.length > 0 ? (
        <p>
          האתר משתמש בכלי אנליטיקה ופרסום ({tools.join(', ')}) שאוספים מידע סטטיסטי על השימוש באתר באמצעות עוגיות
          (cookies). אפשר לחסום עוגיות בהגדרות הדפדפן.
        </p>
      ) : (
        <p>
          האתר עשוי להשתמש בכלי אנליטיקה ופרסום כמו Google Analytics, Google Ads ו-Meta Pixel, שאוספים מידע סטטיסטי על
          השימוש באתר באמצעות עוגיות (cookies). אפשר לחסום עוגיות בהגדרות הדפדפן.
        </p>
      )}
      <h2>שמירת מידע</h2>
      <p>הפרטים נשמרים כל עוד הם נדרשים לטיפול בפנייה ולניהול הקשר העסקי.</p>
      <h2>הזכויות שלכם</h2>
      <p>אתם רשאים לבקש לעיין במידע שנשמר עליכם, לתקן אותו או למחוק אותו. פנו אלינו ונטפל בבקשה.</p>
      <h2>יצירת קשר</h2>
      <ul>
        <li>
          <span dir="ltr">{site.name}</span>
        </li>
        {site.contact.phone ? (
          <li>
            טלפון: <bdi dir="ltr">{formatPhoneDisplay(site.contact.phone)}</bdi>
          </li>
        ) : null}
        {site.contact.email ? (
          <li>
            אימייל: <bdi dir="ltr">{site.contact.email}</bdi>
          </li>
        ) : null}
        <li>
          <Link href="/#contact" className="underline hover:text-fg">
            טופס יצירת קשר באתר
          </Link>
        </li>
      </ul>
    </LegalPage>
  );
}
