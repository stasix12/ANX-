import { finalCta as copy } from '@/content/copy';
import { CtaLink } from '@/components/ui/CtaLink';
import { Reveal } from '@/components/ui/Reveal';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { WhatsAppIcon } from '@/components/ui/icons';

export function FinalCta() {
  return (
    <section id="final-cta" aria-labelledby="final-title" className="section pb-0 lg:pb-0">
      <div className="container-site">
        <Reveal>
          <div
            className="rounded-[var(--radius-xl)] border border-border px-6 py-12 text-center sm:px-12 lg:py-20"
            style={{ background: 'var(--gradient-cta)' }}
          >
            <h2 id="final-title" className="h2 mx-auto max-w-[22ch] text-fg">
              {copy.title}
            </h2>
            <p className="lead mx-auto mt-5 max-w-[34rem] text-muted">{copy.text}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaLink location="final_cta" label={copy.primary} className="btn btn-primary btn-lg">
                {copy.primary}
              </CtaLink>
              <WhatsAppLink location="final_cta" className="btn btn-whatsapp btn-lg">
                <WhatsAppIcon className="h-5 w-5" />
                {copy.whatsapp}
              </WhatsAppLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
