/**
 * Three steps that set expectations for an order with no online checkout:
 * the list is a basket, and the "payment page" is a WhatsApp chat with the
 * maker. Said plainly before the FAQ so nobody hunts for a card form.
 */
const steps = [
  { title: 'בוחרים מוצר ודגם', text: 'מקסי או מיני — כל כרטיס מראה למה הוא מתאים.' },
  { title: 'מוסיפים להזמנה', text: 'אוספים כמה פריטים שרוצים. ההזמנה נשמרת גם אם יוצאים מהאתר.' },
  { title: 'שולחים ומאשרים', text: 'ההזמנה נשלחת בוואטסאפ, ומאשרים איתנו התאמה, משלוח ותשלום.' },
];

export function HowToOrder() {
  return (
    <section aria-labelledby="how-title" className="border-y border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <h2 id="how-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          איך מזמינים
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4 rounded-card border border-ink-700 bg-white p-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist-100 text-sm font-extrabold text-white tabular-nums">
                {index + 1}
              </span>
              <div>
                <p className="font-bold">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-mist-500">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
