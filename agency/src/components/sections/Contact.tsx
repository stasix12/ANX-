import { form as copy } from '@/content/copy';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { LeadForm } from '@/components/sections/LeadForm';

/** #contact — the destination of every "קבלו הצעה" on the page. */
export function Contact() {
  return (
    <section id="contact" aria-labelledby="contact-title" className="section">
      <div className="container-narrow">
        <SectionHeading id="contact-title" eyebrow={copy.eyebrow} title={copy.title} intro={copy.sub} />
        <div className="relative mt-8">
          <LeadForm />
        </div>
      </div>
    </section>
  );
}
