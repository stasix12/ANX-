import { Section } from '@/components/Section';
import { HoseIcon, MachineIcon, SparkleIcon, ToolIcon } from '@/components/icons';

const steps = [
  {
    Icon: ToolIcon,
    title: 'ידית השאיבה נוגעת בבד',
    body: 'מעבירים את הידית בתנועה איטית ורציפה על פני הריפוד — בדיוק כמו בעבודה אצל הלקוח.',
  },
  {
    Icon: HoseIcon,
    title: 'הצינור שולף הכל בלי להשאיר עודף מים',
    body: 'המים והלכלוך יוצאים מהסיבים דרך צינור השאיבה, כך שלא נשארת רטיבות מיותרת בבד.',
  },
  {
    Icon: SparkleIcon,
    title: 'תוצאה נקייה שמתייבשת מהר',
    body: 'מתאמי ANX3D שומרים על עוצמת שאיבה קבועה לאורך כל המעבר, כך שהריפוד יוצא נקי באמת.',
  },
];

const sceneViewBox = '0 0 1000 560';

/**
 * Illustrated, not filmed: the whole site ships with numbered SVG
 * placeholders rather than stock photography, so this scene is a crafted
 * animated diagram — a cushion that visibly cleans up as the wand sweeps
 * across it — not a recording. Swap in real footage here once you have it.
 */
export function CleaningDemo() {
  return (
    <Section
      id="how-it-works"
      eyebrow="איך זה עובד"
      title="מהריפוד המוכתם לספה נקייה, תוך שתי העברות"
      description="ידית שאיבה, צינור ומתאם — שלושת המוצרים המרכזיים שלנו, בפעולה אחת רציפה."
    >
      <div
        aria-hidden
        className="relative aspect-[16/11] overflow-hidden rounded-card border border-ink-700 surface sm:aspect-[16/9]"
      >
        {/* Base scene: the cushion before cleaning. */}
        <svg viewBox={sceneViewBox} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <SceneShell />
          <SceneStains />
        </svg>

        {/*
          Clean scene, identically positioned and scaled to the base above,
          cropped by an animated clip-path so it reveals in step with the
          wand instead of squishing as it "grows".
        */}
        <svg
          viewBox={sceneViewBox}
          preserveAspectRatio="xMidYMid slice"
          className="demo-clean-wrap absolute inset-0 h-full w-full animate-clean-reveal"
        >
          <SceneShell />
          <SceneClean />
        </svg>

        {/*
          The wand, its trailing hose stub and its dirt particles are all one
          moving group: a hose drawn as a separate fixed-position line would
          only line up with the wand at one instant and visibly detach from
          it everywhere else along the sweep. Nesting everything inside the
          same animated wrapper means it all travels together for free.
        */}
        <div className="demo-wand absolute top-[46%] left-[6%] animate-wand-sweep">
          <svg width="74" height="86" viewBox="-10 0 74 86" fill="none">
            <path
              d="M14,66 C 2,74 -4,80 -8,84"
              fill="none"
              stroke="var(--color-brand-500)"
              strokeWidth="2.5"
              strokeDasharray="3 3"
              strokeLinecap="round"
              opacity="0.6"
            />
            <rect
              x="21"
              y="4"
              width="22"
              height="52"
              rx="11"
              fill="var(--color-ink-850)"
              stroke="var(--color-brand-600)"
              strokeWidth="3"
            />
            <rect
              x="10"
              y="58"
              width="44"
              height="20"
              rx="8"
              fill="var(--color-brand-500)"
              fillOpacity="0.18"
              stroke="var(--color-brand-600)"
              strokeWidth="3"
            />
            <ellipse cx="32" cy="80" rx="20" ry="5" fill="var(--color-brand-400)" opacity="0.35" />
          </svg>

          {/* Dirt puffing off the nozzle while the wand is actively sweeping. */}
          <div className="demo-particle absolute top-[64px] left-[8px] h-2 w-2 rounded-full bg-brand-600 animate-suction-particle" />
          <div
            className="demo-particle absolute top-[64px] left-[8px] h-1.5 w-1.5 rounded-full bg-brand-500 animate-suction-particle"
            style={{ animationDelay: '-3s' }}
          />
          <div
            className="demo-particle absolute top-[64px] left-[8px] h-2 w-2 rounded-full bg-brand-600 animate-suction-particle"
            style={{ animationDelay: '-6s' }}
          />
          <div
            className="demo-particle absolute top-[64px] left-[8px] h-1.5 w-1.5 rounded-full bg-brand-500 animate-suction-particle"
            style={{ animationDelay: '-9s' }}
          />
        </div>

        {/* Machine parked in the corner, its status dot pulsing while it runs. */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl border border-ink-700 bg-white/85 px-2.5 py-2 backdrop-blur-sm">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600">
            <MachineIcon className="h-4 w-4" />
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-mist-300">
            <span className="h-1.5 w-1.5 rounded-full bg-[#25D366] animate-power-dot" />
            פועלת
          </span>
        </div>

        {/* Honest label — this is a diagram, not a photo. */}
        <span className="absolute top-3 right-3 rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold text-mist-500 backdrop-blur-sm">
          הדמיה להמחשה — לא צילום אמיתי
        </span>
      </div>

      <ol className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {steps.map(({ Icon, title, body }, index) => (
          <li key={title} className="rounded-card border border-ink-700 surface p-6">
            <span className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-extrabold text-white">
                {index + 1}
              </span>
              <Icon className="h-6 w-6 text-brand-600" />
            </span>
            <h3 className="mt-4 text-lg font-bold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist-300">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Cushion + armrest silhouette shared by both the dirty base and the clean overlay. */
function SceneShell() {
  return (
    <>
      <rect x="90" y="170" width="780" height="320" rx="48" fill="var(--color-ink-800)" />
      <rect x="10" y="90" width="120" height="400" rx="46" fill="var(--color-ink-900)" stroke="var(--color-ink-700)" strokeWidth="3" />
      <rect x="70" y="140" width="780" height="320" rx="48" fill="var(--color-ink-900)" stroke="var(--color-brand-500)" strokeWidth="3" />
      <path d="M160,190 C 400,225 600,225 830,190" fill="none" stroke="var(--color-ink-700)" strokeWidth="3" opacity="0.7" />
      <path d="M160,410 C 400,445 600,445 830,410" fill="none" stroke="var(--color-ink-700)" strokeWidth="3" opacity="0.7" />
    </>
  );
}

/** Stains and dirt speckles — the "before" state, sits on top of the shell. */
function SceneStains() {
  const speckles: [number, number, number][] = [
    [180, 230, 5],
    [230, 310, 4],
    [270, 190, 5],
    [320, 360, 6],
    [370, 250, 4],
    [420, 400, 5],
    [470, 220, 6],
    [520, 340, 4],
    [560, 270, 5],
    [610, 400, 4],
    [650, 230, 6],
    [700, 350, 5],
    [740, 280, 4],
    [780, 380, 5],
  ];

  return (
    <>
      <ellipse cx="290" cy="270" rx="72" ry="42" fill="#8b6f47" opacity="0.16" />
      <ellipse cx="640" cy="360" rx="92" ry="52" fill="#8b6f47" opacity="0.14" />
      {speckles.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#7a6349" opacity="0.4" />
      ))}
    </>
  );
}

/** Fine weave texture and a soft sheen — the "after" state. */
function SceneClean() {
  return (
    <>
      <defs>
        <pattern id="demo-weave" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="16" stroke="var(--color-ink-700)" strokeWidth="1.5" />
        </pattern>
        <clipPath id="demo-cushion-clip">
          <rect x="70" y="140" width="780" height="320" rx="48" />
        </clipPath>
        <radialGradient id="demo-sheen" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor="var(--color-brand-300)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-brand-300)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="70" y="140" width="780" height="320" fill="url(#demo-weave)" clipPath="url(#demo-cushion-clip)" opacity="0.6" />
      <ellipse cx="430" cy="240" rx="230" ry="100" fill="url(#demo-sheen)" />
    </>
  );
}
