import { hero } from '@/content/copy';

/**
 * Laptop + phone product shot drawn with plain elements — no raster, no CLS,
 * and the LCP stays on the h1 text. The "site" inside shows a deliberate
 * hierarchy (header, hero, cards, form, WhatsApp float) rather than decoration.
 */
export function HeroMockup() {
  return (
    <div
      role="img"
      aria-label={hero.mockupAlt}
      className="hero-fade relative mx-auto w-full max-w-[640px] lg:-rotate-[1.5deg]"
      style={{ aspectRatio: '16 / 11' }}
    >
      {/* ambient bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[10%] -z-10"
        style={{ background: 'radial-gradient(circle at 40% 45%, rgba(59,130,246,0.18), transparent 62%)' }}
      />

      {/* laptop */}
      <div className="absolute inset-x-0 top-0">
        <div
          className="relative rounded-[14px] border border-white/10 bg-[#0e1626] p-2.5"
          style={{ boxShadow: 'var(--shadow-mockup)' }}
        >
          <FakeSite />
        </div>
        <div
          aria-hidden
          className="relative -mx-[5%] h-1.5 rounded-b-[8px]"
          style={{ background: 'linear-gradient(180deg,#2a3650,#1f2a44)' }}
        >
          <span className="absolute inset-x-[30%] top-0 h-[2px] rounded-b bg-[#0b1220]" />
        </div>
      </div>

      {/* phone — overlaps the laptop's inner (start) edge */}
      <div
        className="absolute -bottom-[8%] -start-[2%] w-[27%] lg:-start-[6%] rounded-[26px] border border-white/[0.12] bg-[#0e1626] p-1.5"
        style={{ aspectRatio: '9 / 19', boxShadow: '0 24px 48px -16px rgba(0,0,0,0.8)' }}
      >
        <div className="relative h-full overflow-hidden rounded-[20px] bg-white">
          <span aria-hidden className="absolute inset-x-0 top-1.5 mx-auto h-[5px] w-[34%] rounded-full bg-[#0e1626]" />
          <FakePhoneSite />
        </div>
      </div>
    </div>
  );
}

/**
 * Abstract "modern business site" — shared by the hero laptop and the
 * before/after "אחרי" frame so both speak the same visual language.
 */
export function FakeSite({ className = 'aspect-[16/10] rounded-[8px]' }: { className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden bg-white ${className}`} aria-hidden>
      {/* header */}
      <div className="flex h-[7%] items-center justify-between border-b border-[#e8edf5] px-[3%]">
        <span className="h-[38%] w-[9%] rounded-[2px] bg-[#0b1220]" />
        <span className="flex gap-[6px]">
          <i className="block h-[6px] w-[22px] rounded-full bg-[#dce3ef]" />
          <i className="block h-[6px] w-[22px] rounded-full bg-[#dce3ef]" />
          <i className="block h-[6px] w-[30px] rounded-full bg-[#2563eb]" />
        </span>
      </div>
      {/* hero band */}
      <div className="flex items-center gap-[4%] px-[5%] pt-[5%] pb-[4%]">
        <div className="flex-1">
          <span className="block h-[9px] w-[72%] rounded-[3px] bg-[#0b1220]" />
          <span className="mt-[6px] block h-[9px] w-[52%] rounded-[3px] bg-[#0b1220]" />
          <span className="mt-[8px] block h-[5px] w-[64%] rounded-full bg-[#c9d2e3]" />
          <span className="mt-[4px] block h-[5px] w-[48%] rounded-full bg-[#c9d2e3]" />
          <span className="mt-[10px] flex gap-[6px]">
            <i className="block h-[12px] w-[36px] rounded-[3px] bg-[#2563eb]" />
            <i className="block h-[12px] w-[36px] rounded-[3px] bg-[#25d366]" />
          </span>
        </div>
        <div
          className="w-[38%] self-stretch rounded-[6px]"
          style={{ background: 'linear-gradient(135deg,#eaf0fa 0%,#d6e1f5 100%)', minHeight: 46 }}
        />
      </div>
      {/* cards */}
      <div className="grid grid-cols-3 gap-[3%] px-[5%]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[6px] bg-[#f6f8fc] p-[6%]">
            <span className="block h-[14px] w-[14px] rounded-full bg-[#dbe7fb]" />
            <span className="mt-[6px] block h-[5px] w-[70%] rounded-full bg-[#0b1220]/70" />
            <span className="mt-[4px] block h-[4px] w-[90%] rounded-full bg-[#c9d2e3]" />
          </div>
        ))}
      </div>
      {/* lead form band */}
      <div className="mt-[4%] grid grid-cols-[1fr_38%] items-center gap-[4%] px-[5%]">
        <div>
          <span className="block h-[7px] w-[60%] rounded-[3px] bg-[#0b1220]" />
          <span className="mt-[6px] block h-[5px] w-[80%] rounded-full bg-[#c9d2e3]" />
          <span className="mt-[4px] block h-[5px] w-[55%] rounded-full bg-[#c9d2e3]" />
        </div>
        <div className="rounded-[6px] bg-[#f6f8fc] p-[4%]">
          <span className="block h-[8px] w-full rounded-[2px] border border-[#dce3ef] bg-white" />
          <span className="mt-[4px] block h-[8px] w-full rounded-[2px] border border-[#dce3ef] bg-white" />
          <span className="mt-[5px] block h-[9px] w-full rounded-[2px] bg-[#2563eb]" />
        </div>
      </div>
      {/* footer strip */}
      <span className="absolute inset-x-0 bottom-0 h-[5%] bg-[#0b1220]" />
      {/* whatsapp float */}
      <span className="absolute bottom-[8%] start-[4%] h-[11px] w-[11px] rounded-full bg-[#25d366] shadow-[0_2px_6px_rgba(37,211,102,0.5)]" />
    </div>
  );
}

function FakePhoneSite() {
  return (
    <div className="absolute inset-0 px-[10%] pt-[16%]" aria-hidden>
      <span className="block h-[6%] w-[28%] rounded-[2px] bg-[#0b1220]" />
      <span className="mt-[14%] block h-[7px] w-[92%] rounded-[3px] bg-[#0b1220]" />
      <span className="mt-[5px] block h-[7px] w-[70%] rounded-[3px] bg-[#0b1220]" />
      <span className="mt-[9px] block h-[4px] w-[80%] rounded-full bg-[#c9d2e3]" />
      <span className="mt-[3px] block h-[4px] w-[60%] rounded-full bg-[#c9d2e3]" />
      <span className="mt-[12%] block h-[11px] w-full rounded-[3px] bg-[#2563eb]" />
      <span className="mt-[6px] block h-[11px] w-full rounded-[3px] bg-[#25d366]" />
      <div className="mt-[14%] rounded-[6px] bg-[#f6f8fc] p-[8%]">
        <span className="block h-[10px] w-[10px] rounded-full bg-[#dbe7fb]" />
        <span className="mt-[5px] block h-[4px] w-[70%] rounded-full bg-[#0b1220]/70" />
        <span className="mt-[3px] block h-[3px] w-[90%] rounded-full bg-[#c9d2e3]" />
      </div>
      <div className="mt-[8%] rounded-[6px] bg-[#f6f8fc] p-[8%]">
        <span className="block h-[7px] w-full rounded-[2px] border border-[#dce3ef] bg-white" />
        <span className="mt-[4px] block h-[7px] w-full rounded-[2px] border border-[#dce3ef] bg-white" />
        <span className="mt-[5px] block h-[8px] w-full rounded-[2px] bg-[#2563eb]" />
      </div>
      <span className="absolute bottom-[4%] start-[8%] h-[10px] w-[10px] rounded-full bg-[#25d366] shadow-[0_2px_6px_rgba(37,211,102,0.5)]" />
    </div>
  );
}
