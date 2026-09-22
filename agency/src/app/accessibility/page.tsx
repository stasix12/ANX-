import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/config/site';
import { pageOpenGraph, pageTwitter } from '@/lib/metadata';
import { formatPhoneDisplay } from '@/lib/phone';
import { LegalPage } from '@/components/layout/LegalPage';

const title = 'הצהרת נגישות';
const description = `הצהרת הנגישות של אתר ${site.name}: מה נעשה כדי שהאתר יהיה נגיש, מגבלות ידועות ואיך לפנות אלינו.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/accessibility' },
  openGraph: pageOpenGraph('/accessibility', title, description),
  twitter: pageTwitter(title, description),
};

/**
 * TODO (client): confirm whether an accessibility coordinator must be named
 * and whether an external audit was done. Never claim "fully accessible".
 */
export default function AccessibilityPage() {
  const hasContact = site.contact.phone || site.contact.whatsapp || site.contact.email;
  return (
    <LegalPage title="הצהרת נגישות" path="/accessibility" updated={site.legalPagesUpdated}>
      <p>
        אנחנו ב-<span dir="ltr">{site.name}</span> רואים חשיבות בכך שהאתר יהיה נגיש לכלל הציבור, כולל אנשים עם מוגבלות.
        האתר תוכנן ונבנה מתוך כוונה לעמוד בהנחיות הנגישות <span dir="ltr">WCAG 2.1</span> ברמה AA, ככל שהדבר ניתן.
      </p>
      <h2>מה נעשה באתר</h2>
      <ul>
        <li>מבנה עמוד סמנטי עם כותרות מסודרות וקישור דילוג לתוכן הראשי.</li>
        <li>ניווט מלא באמצעות מקלדת, כולל תפריט, שאלות נפוצות וטפסים.</li>
        <li>ניגודיות צבעים מספקת בין טקסט לרקע.</li>
        <li>טקסט חלופי לתמונות ותוויות ברורות לכל שדה בטופס.</li>
        <li>התאמה לקוראי מסך ולהגדלת טקסט בדפדפן.</li>
        <li>הפחתת אנימציות למשתמשים שהגדירו זאת במערכת ההפעלה.</li>
      </ul>
      <h2>מגבלות</h2>
      <p>
        למרות המאמצים, ייתכן שחלקים מסוימים באתר עדיין אינם נגישים במלואם, למשל תוכן שמוטמע ממקורות חיצוניים. אנחנו
        ממשיכים לשפר.
      </p>
      <h2>נתקלתם בבעיה?</h2>
      {hasContact ? <p>נשמח לדעת. פנו אלינו ונטפל בפנייה בהקדם:</p> : null}
      {hasContact ? (
        <ul>
          {site.contact.phone ? (
            <li>
              טלפון: <bdi dir="ltr">{formatPhoneDisplay(site.contact.phone)}</bdi>
            </li>
          ) : null}
          {site.contact.whatsapp ? (
            <li>
              WhatsApp: <bdi dir="ltr">{formatPhoneDisplay(site.contact.whatsapp)}</bdi>
            </li>
          ) : null}
          {site.contact.email ? (
            <li>
              אימייל: <bdi dir="ltr">{site.contact.email}</bdi>
            </li>
          ) : null}
        </ul>
      ) : (
        <p>
          נשמח לדעת. אפשר לפנות אלינו דרך{' '}
          <Link href="/#contact" className="underline hover:text-fg">
            טופס יצירת הקשר
          </Link>{' '}
          באתר ונטפל בפנייה בהקדם.
        </p>
      )}
    </LegalPage>
  );
}
