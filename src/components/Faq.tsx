import { ChevronDownIcon } from '@/components/icons';

/**
 * Placed below the catalog on purpose: it costs nothing above the fold, and it
 * catches the visitor who scrolled the whole way and is still hesitating.
 * Every answer here is an objection that otherwise ends the visit.
 */
export const faqItems = [
  {
    question: 'איך יודעים אם זה מתאים למכונה שלי?',
    answer:
      'כל המוצרים מתאימים לסברינה מקסי ולסברינה מיני — בוחרים את הדגם בכרטיס המוצר. אם אתם לא בטוחים איזה דגם יש לכם, שלחו לנו תמונה של יציאת המכונה בוואטסאפ ונגיד לכם בדיוק מה מתאים, עוד לפני שהזמנתם.',
  },
  {
    question: 'יש הנחה בהזמנה של כמה יחידות?',
    answer:
      'כן. מוסיפים את כל הפריטים לרשימת ההזמנה ושולחים אותה בהודעה אחת — נחזור אליכם עם מחיר לכמות. זה רלוונטי במיוחד לצוותים שמצייידים כמה עובדים, ולמי שמזמין ידיות וצינורות יחד.',
  },
  {
    question: 'כמה זמן לוקח המשלוח?',
    answer:
      'שולחים לכל הארץ. מועד האספקה תלוי בזמינות הפריט ובאזור, ואנחנו מוסרים לכם הערכה מדויקת כבר בהודעת הוואטסאפ הראשונה — לפני שסוגרים הזמנה.',
  },
  {
    question: 'מה קורה אם החלק לא מתאים או מתקלקל?',
    answer:
      'כל המוצרים מגיעים עם אחריות של 12 חודשים על פגמי ייצור. אם הגיע חלק שלא מתאים למכונה שלכם — דברו איתנו ונסדר את זה. אנחנו מייצרים בעצמנו, אז יש לנו גמישות.',
  },
  {
    question: 'אפשר להזמין בהתאמה אישית?',
    answer:
      'כן. אנחנו מפתחים ומייצרים את החלקים בעצמנו, אז אפשר לדבר על זווית אחרת, חיבור לא סטנדרטי או צבע. שלחו תיאור בוואטסאפ ונחזור אליכם עם תשובה.',
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-title" className="pb-16 sm:pb-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 id="faq-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          שאלות נפוצות
        </h2>

        <div className="mt-6 space-y-2.5">
          {faqItems.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border border-ink-700 surface transition-colors duration-300 open:border-brand-500/45"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-start text-sm font-bold sm:text-base">
                <span>{item.question}</span>
                <ChevronDownIcon className="h-5 w-5 shrink-0 text-brand-600 transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-4 text-sm leading-relaxed text-mist-300">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
