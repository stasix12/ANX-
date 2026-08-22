import { Section } from '@/components/Section';
import { ChevronDownIcon } from '@/components/icons';

export const faqItems = [
  {
    question: 'הציוד מתאים לכל דגמי Sabrina?',
    answer:
      'כל המוצרים שלנו תוכננו סביב החיבור הסטנדרטי של Sabrina ומתאימים לרוב הדגמים בשוק. אם אתם לא בטוחים לגבי הדגם שלכם — שלחו לנו תמונה של יציאת המכונה בוואטסאפ ונגיד לכם בדיוק מה מתאים.',
  },
  {
    question: 'איך מזמינים?',
    answer:
      'לוחצים על כפתור ״הזמנה ב-WhatsApp״ ליד המוצר, ההודעה נפתחת אצלכם מוכנה עם שם המוצר, ואנחנו סוגרים את ההזמנה איתכם בצ׳אט — כולל וריאציה, צבע ופרטי משלוח.',
  },
  {
    question: 'לאן אתם שולחים וכמה זמן זה לוקח?',
    answer:
      'יש משלוחים לכל הארץ. זמן האספקה תלוי בזמינות הפריט ובאזור, ואנחנו מעדכנים אתכם על מועד משוער כבר בשלב ההזמנה בוואטסאפ.',
  },
  {
    question: 'אפשר להזמין כמה פריטים יחד?',
    answer:
      'בהחלט, וזה גם משתלם יותר במשלוח. כתבו לנו בוואטסאפ את רשימת הפריטים ונרכיב לכם הזמנה אחת.',
  },
  {
    question: 'יש אחריות על החלקים?',
    answer:
      'כן. כל המוצרים מגיעים עם אחריות של 12 חודשים על פגמי ייצור. בלאי משימוש רגיל אינו נכלל, אבל תמיד אפשר לפנות אלינו ונמצא פתרון.',
  },
  {
    question: 'אתם מייצרים חלקים בהתאמה אישית?',
    answer:
      'אנחנו מפתחים ומייצרים בעצמנו, ולכן בהחלט אפשר לדבר על התאמות — זווית אחרת, חיבור לא סטנדרטי או צבע. פנו אלינו בוואטסאפ עם התיאור ונחזור אליכם.',
  },
];

export function Faq() {
  return (
    <Section
      id="faq"
      eyebrow="שאלות נפוצות"
      title="כל מה שחשוב לדעת לפני ההזמנה"
      description="לא מצאתם את התשובה? שלחו הודעה בוואטסאפ ונענה אישית."
    >
      <div className="space-y-3">
        {faqItems.map((item) => (
          <details
            key={item.question}
            className="group rounded-2xl border border-ink-700 surface transition-colors duration-300 open:border-brand-500/45 hover:border-ink-600"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-start text-base font-bold sm:text-lg">
              <span>{item.question}</span>
              <ChevronDownIcon className="h-5 w-5 shrink-0 text-brand-600 transition-transform duration-300 group-open:rotate-180" />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-mist-300 sm:text-base">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
