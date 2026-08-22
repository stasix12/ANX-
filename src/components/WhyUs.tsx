import { Section } from '@/components/Section';
import { MachineIcon, PhoneIcon, ShieldIcon, ToolIcon, TruckIcon } from '@/components/icons';

const reasons = [
  {
    Icon: ToolIcon,
    title: 'פותח עבור אנשי מקצוע',
    body: 'כל חלק נבנה מתוך עבודה יומיומית בשטח, לא מקטלוג כללי. המידות, הזוויות והאחיזה נבחרו כדי לקצר זמן עבודה.',
  },
  {
    Icon: MachineIcon,
    title: 'התאמה למכונות Sabrina',
    body: 'הציוד מתוכנן סביב החיבורים של Sabrina, כך שהוא נכנס במקום ועובד — בלי אלתורים ובלי אובדן ואקום.',
  },
  {
    Icon: ShieldIcon,
    title: 'חלקים חזקים ועמידים',
    body: 'חומרים מוקשחים שעומדים בחומרי ניקוי מקצועיים, במים חמים ובבלאי של עבודה רצופה.',
  },
  {
    Icon: TruckIcon,
    title: 'משלוח לכל הארץ',
    body: 'שולחים לכל הארץ. מזמינים בוואטסאפ, מקבלים עדכון על מועד המשלוח וממשיכים לעבוד.',
  },
  {
    Icon: PhoneIcon,
    title: 'שירות ישיר ב-WhatsApp',
    body: 'מדברים ישירות איתנו — בלי טפסים ובלי מוקד. שולחים תמונה של המכונה ומקבלים תשובה מה מתאים לה.',
  },
];

export function WhyUs() {
  return (
    <Section
      id="why"
      eyebrow="למה ANX3D"
      title="ציוד שנבנה בשביל יום עבודה אמיתי"
      description="אנחנו מייצרים חלקים לאנשי מקצוע בתחום ניקוי הספות והריפודים — ומשתמשים בהם בעצמנו לפני שהם מגיעים אליכם."
    >
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {reasons.map(({ Icon, title, body }) => (
          <li
            key={title}
            className="rounded-card border border-ink-700 surface p-6 transition-colors duration-300 hover:border-brand-500/50"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-brand-500/35 bg-brand-500/10 text-brand-300">
              <Icon className="h-6 w-6" />
            </span>
            <h3 className="mt-5 text-lg font-bold tracking-tight">{title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-mist-300">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
