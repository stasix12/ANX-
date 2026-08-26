'use client';

import { useState } from 'react';
import { asset } from '@/lib/site';

export type SceneKind = 'sofa' | 'armchair' | 'mattress';

/**
 * The same piece of furniture drawn twice: stained and washed-out before,
 * saturated and spotless after. Illustrations rather than photo placeholders
 * on purpose — a numbered grey placeholder in the middle of a landing page
 * kills trust, while a clean drawing reads as intentional design until real
 * before/after photos are dropped in. To swap in real photos later, replace
 * the two <Scene>s in BeforeAfter below with <Image> elements — the slider
 * logic doesn't care what the two layers are.
 */
function Scene({ kind, variant }: { kind: SceneKind; variant: 'before' | 'after' }) {
  const dirty = variant === 'before';
  const wall = dirty ? '#dcdcd4' : '#e8f4fd';
  const floor = dirty ? '#c9c4b8' : '#dbeafe';
  const label = {
    sofa: dirty ? 'הספה לפני הניקוי — כתמים ולכלוך' : 'הספה אחרי הניקוי — נקייה ורעננה',
    armchair: dirty ? 'הכורסה לפני הניקוי' : 'הכורסה אחרי הניקוי',
    mattress: dirty ? 'המזרן לפני הניקוי' : 'המזרן אחרי הניקוי',
  }[kind];

  return (
    <svg
      viewBox="0 0 800 500"
      className="h-full w-full"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="800" height="360" fill={wall} />
      <rect y="360" width="800" height="140" fill={floor} />

      {kind === 'sofa' ? <SofaShape dirty={dirty} /> : null}
      {kind === 'armchair' ? <ArmchairShape dirty={dirty} /> : null}
      {kind === 'mattress' ? <MattressShape dirty={dirty} /> : null}

      {dirty ? null : (
        <g stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.9">
          <path d="M210 120v28M196 134h28" />
          <path d="M600 100v22M589 111h22" />
          <path d="M700 190v18M691 199h18" />
        </g>
      )}
    </svg>
  );
}

function SofaShape({ dirty }: { dirty: boolean }) {
  const fabric = dirty ? '#8d9aa3' : '#0284c7';
  const fabricDark = dirty ? '#76838c' : '#0369a1';
  const cushion = dirty ? '#9aa7af' : '#38bdf8';
  return (
    <>
      <rect x="140" y="150" width="520" height="180" rx="28" fill={fabricDark} />
      <rect x="120" y="250" width="560" height="110" rx="26" fill={fabric} />
      <rect x="165" y="175" width="225" height="95" rx="18" fill={cushion} />
      <rect x="410" y="175" width="225" height="95" rx="18" fill={cushion} />
      <rect x="100" y="215" width="70" height="145" rx="24" fill={fabricDark} />
      <rect x="630" y="215" width="70" height="145" rx="24" fill={fabricDark} />
      <rect x="150" y="360" width="26" height="34" rx="6" fill="#6b7280" />
      <rect x="624" y="360" width="26" height="34" rx="6" fill="#6b7280" />
      {dirty ? (
        <g fill="#5d4a37" opacity="0.55">
          <ellipse cx="250" cy="215" rx="34" ry="20" />
          <ellipse cx="278" cy="232" rx="18" ry="11" />
          <ellipse cx="500" cy="205" rx="26" ry="16" />
          <ellipse cx="560" cy="240" rx="20" ry="12" opacity="0.8" />
          <ellipse cx="330" cy="295" rx="40" ry="16" />
          <ellipse cx="455" cy="305" rx="28" ry="13" />
        </g>
      ) : null}
    </>
  );
}

function ArmchairShape({ dirty }: { dirty: boolean }) {
  const fabric = dirty ? '#9d938b' : '#0d9488';
  const fabricDark = dirty ? '#877d75' : '#0f766e';
  const cushion = dirty ? '#aca29a' : '#2dd4bf';
  return (
    <>
      <rect x="280" y="120" width="240" height="210" rx="30" fill={fabricDark} />
      <rect x="305" y="150" width="190" height="120" rx="20" fill={cushion} />
      <rect x="250" y="230" width="300" height="130" rx="28" fill={fabric} />
      <rect x="225" y="210" width="60" height="150" rx="22" fill={fabricDark} />
      <rect x="515" y="210" width="60" height="150" rx="22" fill={fabricDark} />
      <rect x="285" y="360" width="22" height="30" rx="6" fill="#6b7280" />
      <rect x="494" y="360" width="22" height="30" rx="6" fill="#6b7280" />
      {dirty ? (
        <g fill="#5d4a37" opacity="0.55">
          <ellipse cx="380" cy="200" rx="30" ry="18" />
          <ellipse cx="430" cy="225" rx="17" ry="10" />
          <ellipse cx="360" cy="290" rx="34" ry="14" />
          <ellipse cx="455" cy="300" rx="22" ry="11" />
        </g>
      ) : null}
    </>
  );
}

function MattressShape({ dirty }: { dirty: boolean }) {
  const fabric = dirty ? '#c9c2b4' : '#f1f5f9';
  const band = dirty ? '#b3ab9c' : '#bae6fd';
  const stitch = dirty ? '#a49c8d' : '#7dd3fc';
  return (
    <>
      <rect x="110" y="200" width="580" height="150" rx="26" fill={fabric} />
      <rect x="110" y="285" width="580" height="34" rx="14" fill={band} />
      <g stroke={stitch} strokeWidth="3" opacity="0.7">
        <path d="M200 215q20 25 0 55" fill="none" />
        <path d="M320 215q20 25 0 55" fill="none" />
        <path d="M440 215q20 25 0 55" fill="none" />
        <path d="M560 215q20 25 0 55" fill="none" />
      </g>
      <rect x="140" y="350" width="24" height="40" rx="6" fill="#6b7280" />
      <rect x="636" y="350" width="24" height="40" rx="6" fill="#6b7280" />
      {dirty ? (
        <g fill="#8a6f3f" opacity="0.5">
          <ellipse cx="290" cy="250" rx="40" ry="18" />
          <ellipse cx="330" cy="268" rx="20" ry="10" />
          <ellipse cx="520" cy="240" rx="30" ry="15" />
          <ellipse cx="480" cy="320" rx="26" ry="10" />
        </g>
      ) : null}
    </>
  );
}

/**
 * Draggable before/after comparison. The widget runs LTR internally so the
 * clip math and the range direction agree; the Hebrew labels are absolute and
 * unaffected. The invisible range input on top is what makes it work with
 * keyboard and screen readers as well as touch — on a phone the thumb drags
 * anywhere on the image and the native input tracks it smoothly.
 */
export function BeforeAfter({
  kind = 'sofa',
  before = null,
  after = null,
}: {
  kind?: SceneKind;
  /** Optional real photo paths (under /public); the illustration is the fallback. */
  before?: string | null;
  after?: string | null;
}) {
  const [pos, setPos] = useState(50);
  const usePhotos = Boolean(before && after);

  return (
    <div dir="ltr" className="relative aspect-8/5 select-none overflow-hidden rounded-card shadow-xl">
      <div className="absolute inset-0">
        {usePhotos ? (
          <img src={asset(before!)} alt="לפני הניקוי" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <Scene kind={kind} variant="before" />
        )}
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {usePhotos ? (
          <img src={asset(after!)} alt="אחרי הניקוי" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <Scene kind={kind} variant="after" />
        )}
      </div>

      {/* Divider + handle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand-500" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
          </svg>
        </span>
      </div>

      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/45 px-3 py-1 text-sm font-bold text-white">
        לפני
      </span>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-emerald-500 px-3 py-1 text-sm font-bold text-white">
        אחרי
      </span>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="השוואת לפני ואחרי הניקוי"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
