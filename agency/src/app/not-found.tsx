import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'העמוד לא נמצא', robots: { index: false } };

export default function NotFound() {
  return (
    <section className="section">
      <div className="container-narrow text-center">
        <p className="eyebrow justify-center">404</p>
        <h1 className="h2 mt-4 text-fg">העמוד לא נמצא</h1>
        <p className="lead mt-4 text-muted">הכתובת שהגעתם אליה לא קיימת או הוסרה.</p>
        <Link href="/" className="btn btn-primary mt-8">
          חזרה לדף הבית
        </Link>
      </div>
    </section>
  );
}
