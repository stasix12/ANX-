import Link from 'next/link';
import { WhatsAppButton } from '@/components/WhatsAppButton';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-28 text-center sm:px-6 sm:py-36">
      <p className="text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
        הדף הזה לא קיים
      </h1>
      <p className="mt-4 text-mist-300">
        ייתכן שהמוצר הוסר או שהקישור השתנה. אפשר לחזור לקטלוג או לכתוב לנו ישירות.
      </p>
      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/#products"
          className="inline-flex items-center justify-center rounded-full bg-brand-500 px-7 py-3.5 font-bold text-white transition-colors duration-200 hover:bg-brand-400"
        >
          לצפייה במוצרים
        </Link>
        <WhatsAppButton label="דברו איתנו בוואטסאפ" />
      </div>
    </div>
  );
}
