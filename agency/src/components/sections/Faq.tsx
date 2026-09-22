import { faqCopy as copy } from '@/content/copy';
import { faq } from '@/content/faq';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { WhatsAppIcon } from '@/components/ui/icons';
import { FaqAccordion } from '@/components/sections/FaqAccordion';

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="section bg-light text-navy">
      <div className="container-site">
        <div className="max-w-[720px]">
          <Reveal>
            <SectionHeading id="faq-title" eyebrow={copy.eyebrow} title={copy.title} tone="light" />
          </Reveal>
          <div className="mt-8">
            <FaqAccordion items={faq} defaultOpen={faq[0]?.id} />
          </div>
          <p className="mt-8 flex flex-wrap items-center gap-x-2 text-[15px] text-navy-muted">
            {copy.whatsappLine}
            <WhatsAppLink
              context="faq"
              location="faq"
              className="inline-flex items-center gap-1.5 font-semibold text-accent-hover hover:underline"
            >
              <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
              {copy.whatsappCta}
            </WhatsAppLink>
          </p>
        </div>
      </div>
    </section>
  );
}
