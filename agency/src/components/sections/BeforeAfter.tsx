import { beforeAfter as copy } from '@/content/copy';
import { CtaLink } from '@/components/ui/CtaLink';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { CheckIcon } from '@/components/ui/icons';
import { FakeSite } from '@/components/sections/HeroMockup';

/**
 * Side-by-side on desktop, stacked on mobile. No drag slider: it hijacks
 * touch scrolling and reads as a gimmick. The frames are abstract CSS sites
 * labelled "המחשה" — no fake brand names.
 */
export function BeforeAfter() {
  return (
    <section id="before-after" aria-labelledby="before-after-title" className="section">
      <div className="container-site">
        <Reveal>
          <SectionHeading id="before-after-title" eyebrow={copy.eyebrow} title={copy.title} intro={copy.intro} />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <Frame label={copy.beforeLabel} tone="before" caption={copy.beforeCaption}>
              <OldSite />
            </Frame>
          </Reveal>
          <Reveal delay={80}>
            <Frame label={copy.afterLabel} tone="after" caption={copy.afterCaption}>
              <FakeSite className="aspect-[16/10]" />
            </Frame>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <ul className="mt-10 grid divide-y divide-border border-y border-border lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0">
            {copy.pairs.map((pair, i) => (
              <li
                key={pair.after}
                className={`grid min-w-0 grid-cols-2 gap-4 py-3 text-sm ${
                  i < copy.pairs.length - 2 ? 'lg:border-b lg:border-border' : ''
                }`}
              >
                <span className="flex min-w-0 items-start gap-2 text-subtle">
                  <XMark />
                  <span className="line-through decoration-subtle/60">{pair.before}</span>
                </span>
                <span className="flex min-w-0 items-start gap-2 font-semibold text-fg">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
                  <span>{pair.after}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <CtaLink location="before_after" label={copy.cta} className="btn btn-primary">
              {copy.cta}
            </CtaLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function XMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function Frame({
  label,
  tone,
  caption,
  children,
}: {
  label: string;
  tone: 'before' | 'after';
  caption: string;
  children: React.ReactNode;
}) {
  const after = tone === 'after';
  return (
    <figure>
      <div className="mb-3 flex items-center gap-3">
        <span
          className={
            after
              ? 'badge'
              : 'inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-semibold text-muted'
          }
        >
          {label}
        </span>
        <span className="text-xs text-subtle">{copy.illustration}</span>
      </div>
      <div
        className={`overflow-hidden rounded-[var(--radius-lg)] border bg-surface-1 ${after ? 'border-accent/40' : 'border-border'}`}
        style={after ? { boxShadow: 'var(--shadow-glow)' } : undefined}
        aria-hidden
      >
        <div className="flex h-7 items-center gap-1.5 border-b border-border px-3">
          <i className="h-2 w-2 rounded-full bg-border-strong" />
          <i className="h-2 w-2 rounded-full bg-border-strong" />
          <i className="h-2 w-2 rounded-full bg-border-strong" />
        </div>
        {children}
      </div>
      <figcaption className={`mt-3 text-[13px] ${after ? 'text-muted' : 'text-subtle'}`}>{caption}</figcaption>
    </figure>
  );
}

function OldSite() {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#e5e7eb] p-[5%] grayscale">
      <div className="mx-auto flex h-[9%] w-[92%] items-center justify-center gap-2 border-b border-[#cfd3d9]">
        <span className="h-[5px] w-[12%] rounded bg-[#9aa0aa]" />
        <span className="h-[5px] w-[12%] rounded bg-[#9aa0aa]" />
        <span className="h-[5px] w-[12%] rounded bg-[#9aa0aa]" />
        <span className="h-[5px] w-[12%] rounded bg-[#9aa0aa]" />
      </div>
      <div className="mx-auto mt-[4%] h-[7px] w-[60%] rounded bg-[#7c8390]" />
      <div className="mt-[4%] space-y-[5px]">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="block h-[4px] w-full rounded bg-[#b4b9c2]" />
        ))}
      </div>
      <div className="mx-auto mt-[4%] h-[6px] w-[45%] rounded bg-[#9aa0aa]" />
      <div className="mt-[3%] space-y-[5px]">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="block h-[4px] w-full rounded bg-[#b4b9c2]" />
        ))}
      </div>
      <span className="mx-auto mt-[4%] block h-[6px] w-[14%] rounded-[2px] bg-[#9aa0aa]" />
    </div>
  );
}
