import Link from 'next/link';
import { CATEGORIES } from '@/lib/platform/catalog';

/**
 * The sales landing: one national cleaning brand, one clear CTA. Ad traffic
 * lands here (UTM params ride through to the funnel via the CTA links).
 */
export default function CleanLanding() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-28">
      {/* Header */}
      <header className="flex items-center justify-between py-5">
        <div className="text-xl font-black text-brand-400">
          ✨ קלין<span className="text-mist-100"> ישראל</span>
        </div>
        <a href="tel:*3960" className="rounded-full bg-ink-800 px-4 py-2 text-sm font-bold text-mist-100">
          📞 חייגו *3960
        </a>
      </header>

      {/* Hero */}
      <section className="animate-rise pt-6 text-center">
        <span className="inline-block rounded-full bg-brand-500/10 px-4 py-1.5 text-sm font-bold text-brand-400">
          רשת ארצית · בעלי מקצוע מאומתים · מחיר סגור מראש
        </span>
        <h1 className="mt-5 text-4xl font-black leading-tight text-mist-100 sm:text-5xl">
          הספה שלכם תיראה
          <span className="text-brand-500"> כמו חדשה</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-mist-300">
          ניקוי עמוק לספות, מזרנים, שטיחים ומזגנים — סוגרים מחיר ומועד בשיחה אחת,
          ובעל מקצוע מדורג מגיע אליכם הביתה.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3">
          <Link
            href="/clean/quote"
            className="w-full max-w-sm rounded-2xl bg-brand-500 px-8 py-4 text-center text-lg font-black text-on-brand shadow-lg shadow-brand-500/25 hover:bg-brand-600"
          >
            קבלו מחיר לניקוי ←
          </Link>
          <span className="text-sm text-mist-500">ללא התחייבות · חוזרים אליכם תוך דקות</span>
        </div>
      </section>

      {/* Trust strip */}
      <section className="mt-12 grid grid-cols-3 gap-3 text-center">
        {[
          ['4.9★', 'דירוג ממוצע'],
          ['12,000+', 'בתים נקיים'],
          ['בכל הארץ', 'מאילת עד חיפה'],
        ].map(([big, small]) => (
          <div key={small} className="surface rounded-card px-2 py-4">
            <div className="text-lg font-black text-brand-400">{big}</div>
            <div className="mt-1 text-xs text-mist-500">{small}</div>
          </div>
        ))}
      </section>

      {/* Services */}
      <section className="mt-12">
        <h2 className="text-2xl font-black text-mist-100">מה מנקים אצלכם?</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORIES.filter((c) => c.active).map((c) => (
            <Link
              key={c.id}
              href={`/clean/quote?service=${c.id}`}
              className="surface flex flex-col items-center gap-2 rounded-card p-5 text-center"
            >
              <span className="text-3xl">{c.emoji}</span>
              <span className="font-bold text-mist-100">{c.name}</span>
              <span className="text-xs text-mist-500">החל מ-₪{Math.round(c.basePrice * 0.7)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-12">
        <h2 className="text-2xl font-black text-mist-100">איך זה עובד?</h2>
        <ol className="mt-4 space-y-3">
          {[
            ['1', 'ממלאים בקשה קצרה', 'מה מנקים, איפה ומתי — לוקח פחות מדקה.'],
            ['2', 'נציג חוזר עם מחיר סגור', 'בלי הפתעות: המחיר שנסגר בטלפון הוא המחיר.'],
            ['3', 'בעל מקצוע מאומת מגיע', 'מנקה מדורג עם ציוד מקצועי, בחלון הזמן שקבעתם.'],
          ].map(([n, title, body]) => (
            <li key={n} className="surface flex items-start gap-4 rounded-card p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 font-black text-on-brand">
                {n}
              </span>
              <div>
                <div className="font-bold text-mist-100">{title}</div>
                <div className="mt-0.5 text-sm text-mist-300">{body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Reviews */}
      <section className="mt-12">
        <h2 className="text-2xl font-black text-mist-100">לקוחות מספרים</h2>
        <div className="mt-4 space-y-3">
          {[
            ['דני, באר שבע', 'הספה חזרה כמו חדשה. הגיעו באותו יום, מחיר הוגן ושירות אדיב.'],
            ['מירי, תל אביב', 'סגרתי מחיר בטלפון תוך שתי דקות, המנקה הגיע בזמן בדיוק. מומלץ!'],
            ['יעל, נתיבות', 'כתמים שחשבתי שלעולם לא ירדו — נעלמו. אזמין שוב בלי לחשוב פעמיים.'],
          ].map(([who, text]) => (
            <figure key={who} className="surface rounded-card p-4">
              <div className="text-amber-400">★★★★★</div>
              <blockquote className="mt-1 text-sm text-mist-100">“{text}”</blockquote>
              <figcaption className="mt-2 text-xs font-bold text-mist-500">{who}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Secondary CTA */}
      <section className="mt-12 rounded-card bg-brand-500 p-6 text-center text-on-brand">
        <h2 className="text-2xl font-black">מוכנים לבית נקי?</h2>
        <p className="mt-1 opacity-90">קבלו הצעת מחיר תוך דקות — בלי התחייבות.</p>
        <Link
          href="/clean/quote"
          className="mt-4 inline-block rounded-2xl bg-white px-8 py-3 font-black text-brand-600"
        >
          הזמינו ניקוי
        </Link>
      </section>

      <footer className="mt-10 border-t border-ink-700 pt-6 text-center text-xs text-mist-500">
        <p>קלין ישראל — רשת ניקוי ארצית</p>
        <p className="mt-2">
          <Link href="/pro/join" className="font-bold text-brand-400">
            בעלי מקצוע: הצטרפו לרשת שלנו ←
          </Link>
        </p>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-850/95 p-3 backdrop-blur sm:hidden">
        <Link
          href="/clean/quote"
          className="block rounded-2xl bg-brand-500 py-3.5 text-center text-lg font-black text-on-brand"
        >
          קבלו מחיר לניקוי ←
        </Link>
      </div>
    </div>
  );
}
