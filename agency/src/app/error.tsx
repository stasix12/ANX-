'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Last-resort boundary: a readable page instead of a blank one. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="section">
      <div className="container-narrow text-center">
        <p className="eyebrow justify-center">שגיאה</p>
        <h1 className="h2 mt-4 text-fg">משהו השתבש</h1>
        <p className="lead mt-4 text-muted">נסו לרענן את העמוד. אם זה חוזר על עצמו, אפשר ליצור איתנו קשר בטופס.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="btn btn-primary">
            לנסות שוב
          </button>
          <Link href="/#contact" className="btn btn-outline">
            צרו קשר
          </Link>
        </div>
      </div>
    </section>
  );
}
