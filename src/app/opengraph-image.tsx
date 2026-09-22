import { ImageResponse } from 'next/og';

/**
 * Placeholder OG image, generated as a real PNG at build time so link previews
 * work everywhere. Latin-only copy: ImageResponse ships without a Hebrew face.
 * Swap this file for a static public/og.jpg once brand artwork is ready.
 */
/** The artwork never changes at runtime, so bake it at build time. */
export const dynamic = 'force-static';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'ANX3D — Professional Cleaning Equipment';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          background: '#ffffff',
          color: '#171717',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* The wordmark's own path glyphs — ANX charcoal, 3D orange. */}
          <svg width="570" height="100" viewBox="0 0 570 100">
            <path fill="#171717" fillRule="evenodd" d="M0,100 L14,0 L76,0 L90,100 L68,100 L63,74 L27,74 L22,100 Z M32,56 L38,20 L52,20 L58,56 Z" />
            <path fill="#171717" transform="translate(120,0)" d="M0,0 L20,0 L70,66 L70,0 L90,0 L90,100 L70,100 L20,34 L20,100 L0,100 Z" />
            <path fill="#171717" transform="translate(240,0)" d="M0,0 L22,0 L90,100 L68,100 Z M68,0 L90,0 L22,100 L0,100 Z" />
            <path fill="#ff6a00" transform="translate(360,0)" d="M30,0 L90,0 L90,21 L10,21 Z M70,19 H90 V41 H70 Z M34,39 H90 V61 H34 Z M70,59 H90 V81 H70 Z M10,79 L90,79 L90,100 L30,100 Z" />
            <path fill="#ff6a00" fillRule="evenodd" transform="translate(480,0)" d="M0,0 L66,0 L90,24 L90,76 L66,100 L0,100 Z M20,20 L58,20 L70,32 L70,68 L58,80 L20,80 Z" />
          </svg>
        </div>

        <div style={{ marginTop: 44, fontSize: 42, color: '#404040', maxWidth: 900 }}>
          Professional Cleaning Equipment
        </div>

        <div style={{ marginTop: 18, fontSize: 34, color: '#666666' }}>
          Handles · Hoses · Adapters — built for Sabrina machines
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 28,
            color: '#666666',
          }}
        >
          <div style={{ width: 60, height: 4, background: '#ff6a00' }} />
          <div>WhatsApp 053-5257250</div>
        </div>
      </div>
    ),
    size,
  );
}
